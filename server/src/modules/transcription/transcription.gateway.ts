// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { createSession, updateSession } from "@/modules/sessions/index.js";
import { createTranscript } from "@/modules/sessions/index.js";
import { createStorageService } from "@/services/storage/index.js";
import { transcribeAudio, removeWhisperRepetitions } from "@/services/whisper/index.js";
import {
  diarizeAudio,
  mapSpeakersToSegments,
} from "@/services/diarization/index.js";
import { config } from "@/config/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import { clientMessageSchema, campaignIdParamSchema } from "./schemas.js";
import type {
  LiveSessionState,
  ActiveSessionMap,
  ServerMessage,
  ClientMessage,
} from "./types.js";
import type { TranscriptSegment } from "@gm-assistant/shared";

const storage = createStorageService();

/** Active live sessions keyed by campaignId — one live session per campaign */
const activeSessions: ActiveSessionMap = new Map();

/** Flush threshold in milliseconds (~3 seconds of wall-clock time) */
const FLUSH_INTERVAL_MS = 3_000;

/** Inactivity warning after 60 seconds */
const INACTIVITY_WARNING_MS = 60_000;

/** Disconnect after 5 minutes of inactivity */
const INACTIVITY_DISCONNECT_MS = 5 * 60_000;

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { event: "error", code, message });
}

function createState(
  campaignId: string,
  userId: string
): LiveSessionState {
  return {
    sessionId: null,
    campaignId,
    userId,
    audioBuffer: [],
    allAudioChunks: [],
    finalAudioBuffer: null,
    segments: [],
    markers: [],
    fullTranscript: "",
    currentOffset: 0,
    saveAudio: true,
    isRecording: false,
    whisperInFlight: false,
    recordingStartTime: 0,
    lastFlushTime: 0,
    inactivityTimer: null,
    warningTimer: null,
  };
}

function resetInactivityTimers(
  state: LiveSessionState,
  socket: WebSocket
): void {
  if (state.warningTimer) clearTimeout(state.warningTimer);
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);

  state.warningTimer = setTimeout(() => {
    send(socket, {
      event: "error",
      code: "INACTIVITY_WARNING",
      message: "No audio received for 60 seconds. Connection will close in 4 minutes if no data is received.",
    });
  }, INACTIVITY_WARNING_MS);

  state.inactivityTimer = setTimeout(() => {
    send(socket, {
      event: "error",
      code: "INACTIVITY_DISCONNECT",
      message: "Disconnecting due to inactivity",
    });
    socket.close(4000, "Inactivity timeout");
  }, INACTIVITY_DISCONNECT_MS);
}

function clearTimers(state: LiveSessionState): void {
  if (state.warningTimer) clearTimeout(state.warningTimer);
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  state.warningTimer = null;
  state.inactivityTimer = null;
}

/**
 * Concatenate WebM audio chunks for S3 storage. Each chunk is a complete
 * WebM file produced by restarting the browser's MediaRecorder. We keep
 * the first file intact and strip the initialization segment (everything
 * before the first Cluster element) from subsequent files so the result
 * is one contiguous WebM stream.
 */
function concatAudioChunks(chunks: Buffer[]): Buffer {
  if (chunks.length === 0) return Buffer.alloc(0);

  const first = chunks[0]!;
  if (chunks.length === 1) return first;

  // WebM Cluster element EBML ID
  const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);

  const parts: Buffer[] = [first];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const clusterPos = chunk.indexOf(CLUSTER_ID);
    if (clusterPos > 0) {
      parts.push(chunk.subarray(clusterPos));
    } else {
      // No cluster found — include whole chunk as fallback
      parts.push(chunk);
    }
  }

  return Buffer.concat(parts);
}

async function flushAudioBuffer(
  state: LiveSessionState,
  socket: WebSocket,
  isFinal: boolean,
  logger: FastifyRequest["log"]
): Promise<void> {
  if (state.audioBuffer.length === 0) return;

  // Each chunk in the buffer is a complete, independently decodable audio
  // file (the client restarts MediaRecorder periodically). Process each
  // one individually through Whisper rather than concatenating them.
  const chunks = [...state.audioBuffer];
  state.audioBuffer = [];
  state.lastFlushTime = Date.now();
  state.whisperInFlight = true;

  const whisperConfig = config.whisper;
  if (!whisperConfig.baseUrl) {
    state.whisperInFlight = false;
    logger.warn("Whisper base URL not configured, skipping transcription");
    return;
  }

  let combinedText = "";
  const combinedSegments: TranscriptSegment[] = [];

  for (const chunk of chunks) {
    const result = await transcribeAudio(chunk, {
      baseUrl: whisperConfig.baseUrl,
      model: whisperConfig.model,
      timeout: whisperConfig.timeout,
    });

    if (!result.ok) {
      logger.error(
        { error: result.error, sessionId: state.sessionId },
        "Whisper transcription failed"
      );
      sendError(socket, "TRANSCRIPTION_ERROR", result.error.message);
      continue;
    }

    const { text, segments: whisperSegments, duration } = result.value;

    if (text.trim()) {
      const newSegments: TranscriptSegment[] = whisperSegments.map((s) => ({
        startTime: s.start + state.currentOffset,
        endTime: s.end + state.currentOffset,
        speaker: "",
        text: s.text.trim(),
      }));

      combinedSegments.push(...newSegments);
      combinedText += (combinedText ? " " : "") + text.trim();
      state.currentOffset += duration;
    }
  }

  state.whisperInFlight = false;

  if (combinedText) {
    // Check for Whisper repetition hallucinations against recent segments.
    // Convert to WhisperSegment format for the filter, then convert back.
    const allSegments = [
      ...state.segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text })),
      ...combinedSegments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text })),
    ];
    const cleaned = removeWhisperRepetitions(allSegments);

    // Extract only the new segments that survived filtering
    const prevCount = state.segments.length;
    const cleanedNew = cleaned.slice(prevCount).map((s) => ({
      startTime: s.start,
      endTime: s.end,
      speaker: "",
      text: s.text,
    }));

    if (cleanedNew.length > 0) {
      const cleanedText = cleanedNew.map((s) => s.text.trim()).join(" ");
      state.segments.push(...cleanedNew);
      state.fullTranscript +=
        (state.fullTranscript ? " " : "") + cleanedText;

      send(socket, {
        event: "transcript",
        text: cleanedText,
        fullText: state.fullTranscript,
        segments: cleanedNew,
        isFinal,
      });
    }
  }

  // If we accumulated more data while Whisper was busy, flush again
  if (!isFinal && state.audioBuffer.length > 0) {
    await flushAudioBuffer(state, socket, false, logger);
  }
}

async function handleStart(
  state: LiveSessionState,
  message: Extract<ClientMessage, { event: "start" }>,
  socket: WebSocket,
  logger: FastifyRequest["log"]
): Promise<void> {
  if (state.isRecording) {
    sendError(socket, "ALREADY_RECORDING", "Session is already recording");
    return;
  }

  const title =
    message.title || `Live Session ${new Date().toLocaleDateString()}`;
  state.saveAudio = message.saveAudio !== false;

  const session = await createSession({
    campaignId: state.campaignId,
    createdBy: state.userId,
    title,
    date: new Date(),
    status: "recording",
  });

  if (!session) {
    sendError(socket, "SESSION_CREATE_FAILED", "Failed to create session");
    return;
  }

  state.sessionId = session.id;
  state.isRecording = true;
  state.recordingStartTime = Date.now();
  state.lastFlushTime = Date.now();

  resetInactivityTimers(state, socket);

  trackEvent(state.userId, "live_transcription_started", {
    session_id: session.id,
    campaign_id: state.campaignId,
  });

  send(socket, { event: "ready", sessionId: session.id });
  logger.info(
    { sessionId: session.id, campaignId: state.campaignId },
    "Live transcription session started"
  );
}

async function handleAudio(
  state: LiveSessionState,
  message: Extract<ClientMessage, { event: "audio" }>,
  socket: WebSocket,
  logger: FastifyRequest["log"]
): Promise<void> {
  if (!state.isRecording) {
    sendError(socket, "NOT_RECORDING", "Send a start event first");
    return;
  }

  resetInactivityTimers(state, socket);

  const chunk = Buffer.from(message.data, "base64");
  state.audioBuffer.push(chunk);
  state.allAudioChunks.push(chunk);

  // Flush if enough wall-clock time has passed and no Whisper call in flight
  const timeSinceFlush = Date.now() - state.lastFlushTime;
  if (timeSinceFlush >= FLUSH_INTERVAL_MS && !state.whisperInFlight) {
    await flushAudioBuffer(state, socket, false, logger);
  }
}

function handleMarker(
  state: LiveSessionState,
  message: Extract<ClientMessage, { event: "marker" }>,
  socket: WebSocket,
  logger: FastifyRequest["log"]
): void {
  if (!state.isRecording) {
    sendError(socket, "NOT_RECORDING", "Send a start event first");
    return;
  }

  const elapsedSeconds = (Date.now() - state.recordingStartTime) / 1000;

  const marker = {
    time: elapsedSeconds,
    label: message.label,
    type: message.type ?? "general",
    notes: message.notes ?? null,
  };

  state.markers.push(marker);

  send(socket, { event: "marker_added", marker });

  logger.info(
    { sessionId: state.sessionId, marker: message.label, time: elapsedSeconds },
    "Marker added"
  );
}

function handleFinalAudio(
  state: LiveSessionState,
  message: Extract<ClientMessage, { event: "final_audio" }>,
  logger: FastifyRequest["log"]
): void {
  state.finalAudioBuffer = Buffer.from(message.data, "base64");
  logger.info(
    { sessionId: state.sessionId, bytes: state.finalAudioBuffer.length },
    "Received final audio for storage"
  );
}

async function handleStop(
  state: LiveSessionState,
  socket: WebSocket,
  logger: FastifyRequest["log"]
): Promise<void> {
  if (!state.isRecording || !state.sessionId) {
    sendError(socket, "NOT_RECORDING", "No active recording to stop");
    return;
  }

  state.isRecording = false;
  clearTimers(state);

  // Flush any remaining audio
  await flushAudioBuffer(state, socket, true, logger);

  const duration = Math.round((Date.now() - state.recordingStartTime) / 1000);

  // Run speaker diarization on the full audio if configured
  const audioForDiarization = state.finalAudioBuffer
    ?? (state.allAudioChunks.length > 0 ? concatAudioChunks(state.allAudioChunks) : null);

  if (config.diarization.baseUrl && audioForDiarization && state.segments.length > 0) {
    try {
      const diarizationResult = await diarizeAudio(audioForDiarization, {
        baseUrl: config.diarization.baseUrl,
        timeout: config.diarization.timeout,
      });

      if (diarizationResult.ok) {
        state.segments = mapSpeakersToSegments(
          state.segments,
          diarizationResult.value.speakers,
        );
        logger.info(
          { sessionId: state.sessionId, speakerSegments: diarizationResult.value.speakers.length },
          "Live session diarization complete",
        );
      } else {
        logger.warn(
          { sessionId: state.sessionId, error: diarizationResult.error.message },
          "Live session diarization failed, continuing without speaker labels",
        );
      }
    } catch (error) {
      logger.warn(
        { sessionId: state.sessionId, error },
        "Live session diarization threw, continuing without speaker labels",
      );
    }
  }

  // Save transcript to DB
  await createTranscript({
    sessionId: state.sessionId,
    content: state.fullTranscript,
    segments: state.segments,
    markers: state.markers,
  });

  // Upload audio to S3 — prefer the complete continuous recording if available
  let audioPath: string | null = null;
  const audioToUpload = state.finalAudioBuffer
    ?? (state.allAudioChunks.length > 0 ? concatAudioChunks(state.allAudioChunks) : null);
  if (state.saveAudio && audioToUpload) {
    audioPath = `campaigns/${state.campaignId}/sessions/${state.sessionId}`;
    const uploadResult = await storage.uploadByKey(audioPath, audioToUpload, {
      contentType: "audio/webm",
    });
    if (!uploadResult.ok) {
      logger.error(
        { error: uploadResult.error, sessionId: state.sessionId },
        "Failed to upload session audio"
      );
      audioPath = null;
    }
  }

  // Update session to ready
  await updateSession(state.sessionId, {
    status: "ready",
    audioPath,
    duration,
  });

  trackEvent(state.userId, "live_transcription_stopped", {
    session_id: state.sessionId,
    campaign_id: state.campaignId,
    duration,
    segment_count: state.segments.length,
    marker_count: state.markers.length,
  });

  send(socket, {
    event: "stopped",
    sessionId: state.sessionId,
    transcript: state.fullTranscript,
  });

  logger.info(
    { sessionId: state.sessionId, duration, segments: state.segments.length },
    "Live transcription session stopped"
  );

  // Remove from active sessions
  activeSessions.delete(state.campaignId);
}

async function handleDisconnect(
  state: LiveSessionState,
  logger: FastifyRequest["log"]
): Promise<void> {
  clearTimers(state);
  activeSessions.delete(state.campaignId);

  if (!state.sessionId || !state.isRecording) return;

  state.isRecording = false;

  // Save partial transcript if we have any segments
  if (state.segments.length > 0 || state.fullTranscript) {
    await createTranscript({
      sessionId: state.sessionId,
      content: state.fullTranscript,
      segments: state.segments,
      markers: state.markers,
    });

    const duration = Math.round(
      (Date.now() - state.recordingStartTime) / 1000
    );

    // Upload partial audio if enabled
    let audioPath: string | null = null;
    const audioToUpload = state.finalAudioBuffer
      ?? (state.allAudioChunks.length > 0 ? concatAudioChunks(state.allAudioChunks) : null);
    if (state.saveAudio && audioToUpload) {
      audioPath = `campaigns/${state.campaignId}/sessions/${state.sessionId}`;
      const uploadResult = await storage.uploadByKey(audioPath, audioToUpload, {
        contentType: "audio/webm",
      });
      if (!uploadResult.ok) {
        logger.error(
          { error: uploadResult.error, sessionId: state.sessionId },
          "Failed to upload partial session audio"
        );
        audioPath = null;
      }
    }

    await updateSession(state.sessionId, {
      status: "ready",
      audioPath,
      duration,
    });

    logger.info(
      { sessionId: state.sessionId, segments: state.segments.length },
      "Saved partial transcript on disconnect"
    );
  } else {
    // No transcript data — mark session as ready with no content
    await updateSession(state.sessionId, { status: "ready" });
  }
}

export async function transcriptionRoutes(
  app: FastifyInstance
): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/:campaignId/sessions/live",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      const paramResult = campaignIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        sendError(socket, "INVALID_PARAMS", "Invalid campaign ID");
        socket.close(4001, "Invalid campaign ID");
        return;
      }

      const { campaignId } = paramResult.data;
      const userId = request.userId!;

      // Verify campaign ownership
      const campaign = await findCampaignByIdAndUserId(campaignId, userId);
      if (!campaign) {
        sendError(socket, "NOT_FOUND", "Campaign not found");
        socket.close(4004, "Campaign not found");
        return;
      }

      // Prevent duplicate live sessions on the same campaign
      if (activeSessions.has(campaignId)) {
        sendError(
          socket,
          "SESSION_EXISTS",
          "A live session is already active for this campaign"
        );
        socket.close(4009, "Duplicate session");
        return;
      }

      activeSessions.set(campaignId, socket);
      const state = createState(campaignId, userId);

      request.log.info(
        { campaignId },
        "Live transcription WebSocket connected"
      );

      socket.on("message", async (raw: Buffer | string) => {
        let parsed: unknown;
        try {
          const text =
            typeof raw === "string" ? raw : raw.toString("utf-8");
          parsed = JSON.parse(text);
        } catch {
          sendError(socket, "INVALID_JSON", "Message must be valid JSON");
          return;
        }

        const result = clientMessageSchema.safeParse(parsed);
        if (!result.success) {
          sendError(
            socket,
            "INVALID_MESSAGE",
            result.error.issues[0]?.message ?? "Invalid message format"
          );
          return;
        }

        const message = result.data;

        try {
          switch (message.event) {
            case "start":
              await handleStart(state, message, socket, request.log);
              break;
            case "audio":
              await handleAudio(state, message, socket, request.log);
              break;
            case "marker":
              handleMarker(state, message, socket, request.log);
              break;
            case "final_audio":
              handleFinalAudio(state, message, request.log);
              break;
            case "stop":
              await handleStop(state, socket, request.log);
              break;
            case "ping":
              if (state.isRecording) resetInactivityTimers(state, socket);
              break;
          }
        } catch (error) {
          request.log.error(
            { error, event: message.event, sessionId: state.sessionId },
            "Error handling WebSocket message"
          );
          sendError(
            socket,
            "INTERNAL_ERROR",
            "An unexpected error occurred"
          );
        }
      });

      socket.on("close", async () => {
        try {
          await handleDisconnect(state, request.log);
        } catch (error) {
          request.log.error(
            { error, sessionId: state.sessionId },
            "Error during disconnect cleanup"
          );
        }
        request.log.info(
          { campaignId, sessionId: state.sessionId },
          "Live transcription WebSocket disconnected"
        );
      });

      socket.on("error", (error) => {
        request.log.error(
          { error, campaignId, sessionId: state.sessionId },
          "WebSocket error"
        );
      });
    }
  );
}

/**
 * Close all active live transcription sessions.
 * Called during graceful shutdown to save partial transcripts.
 */
export async function closeActiveSessions(): Promise<void> {
  const entries = Array.from(activeSessions.entries());
  for (const [campaignId, socket] of entries) {
    try {
      socket.close(1001, "Server shutting down");
    } catch {
      // Socket may already be closed
    }
    activeSessions.delete(campaignId);
  }
}
