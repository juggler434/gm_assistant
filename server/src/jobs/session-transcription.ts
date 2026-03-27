// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Session Transcription Job
 *
 * Background job that processes uploaded session audio:
 * 1. Download audio from S3
 * 2. Send to Whisper service for transcription
 * 3. Store transcript (full text + segments) in the database
 * 4. Update session status to "ready" with duration
 *
 * On failure, marks the session as "recording" so the user can retry.
 */

import { config } from "@/config/index.js";
import { createStorageService } from "@/services/storage/index.js";
import { transcribeAudio } from "@/services/whisper/index.js";
import {
  diarizeAudio,
  mapSpeakersToSegments,
} from "@/services/diarization/index.js";
import {
  updateSession,
  createTranscript,
  findSessionByIdAndCampaignId,
} from "@/modules/sessions/repository.js";
import { trackEvent } from "@/services/metrics/index.js";
import { createQueue } from "@/jobs/index.js";
import { registerHandler } from "./handlers/index.js";
import type { BaseJobData, JobContext } from "./types.js";
import type { TranscriptIndexingJobData } from "./transcript-indexing.js";

// ============================================================================
// Types
// ============================================================================

export interface SessionTranscriptionJobData extends BaseJobData {
  sessionId: string;
  campaignId: string;
  userId: string;
  audioPath: string;
  mimeType: string;
}

const transcriptIndexingQueue = createQueue<TranscriptIndexingJobData>(
  "transcript-indexing",
);

// ============================================================================
// Job Handler
// ============================================================================

async function handleSessionTranscription(
  data: SessionTranscriptionJobData,
  context: JobContext,
): Promise<void> {
  const { sessionId, campaignId, audioPath } = data;
  const startTime = Date.now();

  context.logger.info("Starting session transcription", { sessionId, campaignId });

  // ---- Validate session exists ----
  const session = await findSessionByIdAndCampaignId(sessionId, campaignId);
  if (!session) {
    context.logger.error("Session not found", { sessionId, campaignId });
    throw new Error(`Session ${sessionId} not found`);
  }

  // ---- Stage 1: Download audio from S3 (0 → 10%) ----
  await context.updateProgress({
    percentage: 0,
    message: "Downloading audio from storage",
    metadata: { stage: "download" },
  });

  const storage = createStorageService();
  const downloadResult = await storage.downloadByKey(audioPath);
  if (!downloadResult.ok) {
    context.logger.error("Failed to download audio", {
      sessionId,
      error: downloadResult.error.message,
    });
    await updateSession(sessionId, { status: "recording" });
    throw new Error(`Failed to download audio: ${downloadResult.error.message}`);
  }

  const audioBuffer = Buffer.isBuffer(downloadResult.value.content)
    ? downloadResult.value.content
    : Buffer.from(downloadResult.value.content);

  await context.updateProgress({
    percentage: 10,
    message: "Audio downloaded",
    metadata: { stage: "download", size: audioBuffer.length },
  });

  context.logger.info("Audio downloaded", {
    sessionId,
    size: audioBuffer.length,
  });

  // ---- Stage 2: Transcribe via Whisper (10 → 80%) ----
  if (context.signal.aborted) {
    await updateSession(sessionId, { status: "recording" });
    throw new Error("Job cancelled");
  }

  await context.updateProgress({
    percentage: 10,
    message: "Transcribing audio",
    metadata: { stage: "transcription" },
  });

  if (!config.whisper.baseUrl) {
    context.logger.error("WHISPER_BASE_URL is not configured", { sessionId });
    await updateSession(sessionId, { status: "recording" });
    throw new Error("Whisper service URL is not configured (set WHISPER_BASE_URL)");
  }

  const whisperConfig = {
    baseUrl: config.whisper.baseUrl,
    model: config.whisper.model,
    timeout: config.whisper.timeout,
  };

  const transcriptionResult = await transcribeAudio(
    audioBuffer,
    whisperConfig,
    context.signal,
  );

  if (!transcriptionResult.ok) {
    context.logger.error("Whisper transcription failed", {
      sessionId,
      code: transcriptionResult.error.code,
      error: transcriptionResult.error.message,
    });
    await updateSession(sessionId, { status: "recording" });
    throw new Error(`Transcription failed: ${transcriptionResult.error.message}`);
  }

  const whisperResponse = transcriptionResult.value;

  await context.updateProgress({
    percentage: 80,
    message: "Transcription complete",
    metadata: {
      stage: "transcription",
      duration: whisperResponse.duration,
      segmentCount: whisperResponse.segments.length,
    },
  });

  context.logger.info("Transcription complete", {
    sessionId,
    duration: whisperResponse.duration,
    segmentCount: whisperResponse.segments.length,
    textLength: whisperResponse.text.length,
  });

  // ---- Stage 3: Diarization (80 → 90%) ----
  let segments = whisperResponse.segments.map((s) => ({
    startTime: s.start,
    endTime: s.end,
    speaker: "unknown",
    text: s.text,
  }));

  if (config.diarization.baseUrl) {
    if (context.signal.aborted) {
      await updateSession(sessionId, { status: "recording" });
      throw new Error("Job cancelled");
    }

    await context.updateProgress({
      percentage: 80,
      message: "Identifying speakers",
      metadata: { stage: "diarization" },
    });

    const diarizationResult = await diarizeAudio(
      audioBuffer,
      {
        baseUrl: config.diarization.baseUrl,
        timeout: config.diarization.timeout,
      },
      context.signal,
    );

    if (diarizationResult.ok) {
      segments = mapSpeakersToSegments(segments, diarizationResult.value.speakers);
      context.logger.info("Diarization complete", {
        sessionId,
        speakerSegments: diarizationResult.value.speakers.length,
      });
    } else {
      // Diarization failure is non-fatal — continue with "unknown" speakers
      context.logger.warn("Diarization failed, continuing without speaker labels", {
        sessionId,
        code: diarizationResult.error.code,
        error: diarizationResult.error.message,
      });
    }
  }

  await context.updateProgress({
    percentage: 90,
    message: "Storing transcript",
    metadata: { stage: "storage" },
  });

  // ---- Stage 4: Store transcript (90 → 95%) ----
  if (context.signal.aborted) {
    await updateSession(sessionId, { status: "recording" });
    throw new Error("Job cancelled");
  }

  const transcript = await createTranscript({
    sessionId,
    content: whisperResponse.text,
    segments,
    markers: [],
  });

  if (!transcript) {
    context.logger.error("Failed to store transcript", { sessionId });
    await updateSession(sessionId, { status: "recording" });
    throw new Error("Failed to store transcript record");
  }

  await context.updateProgress({
    percentage: 95,
    message: "Transcript stored",
    metadata: { stage: "storage" },
  });

  // ---- Stage 5: Update session to ready (95 → 98%) ----
  await updateSession(sessionId, {
    status: "ready",
    duration: Math.round(whisperResponse.duration),
  });

  await context.updateProgress({
    percentage: 98,
    message: "Queuing transcript for RAG indexing",
    metadata: { stage: "indexing-queue" },
  });

  // ---- Stage 6: Queue transcript indexing for RAG search ----
  const indexQueueResult = await transcriptIndexingQueue.add(
    "index-transcript",
    {
      sessionId,
      campaignId,
      userId: data.userId,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );

  if (!indexQueueResult.ok) {
    // Non-fatal: transcription succeeded, indexing can be retried
    context.logger.warn("Failed to queue transcript indexing", {
      sessionId,
      error: indexQueueResult.error.message,
    });
  } else {
    context.logger.info("Transcript indexing queued", {
      sessionId,
      jobId: indexQueueResult.value,
    });
  }

  await context.updateProgress({
    percentage: 100,
    message: "Session transcription complete",
    metadata: { stage: "complete" },
  });

  const durationMs = Date.now() - startTime;

  trackEvent("system", "session_transcription_completed", {
    session_id: sessionId,
    campaign_id: campaignId,
    audio_duration: whisperResponse.duration,
    segment_count: whisperResponse.segments.length,
    processing_duration_ms: durationMs,
  });

  context.logger.info("Session transcription complete", {
    sessionId,
    audioDuration: whisperResponse.duration,
    processingDurationMs: durationMs,
  });
}

// ============================================================================
// Handler Registration
// ============================================================================

registerHandler<SessionTranscriptionJobData, void>({
  queueName: "session-transcription",
  handler: handleSessionTranscription,
  description:
    "Transcribes uploaded session audio via Whisper and stores the resulting transcript",
});

export { handleSessionTranscription };
