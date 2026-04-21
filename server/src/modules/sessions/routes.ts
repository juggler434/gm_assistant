// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { createStorageService } from "@/services/storage/index.js";
import { createQueue } from "@/jobs/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import { checkUsageLimit, recordUsage, isStripeConfigured } from "@/modules/billing/index.js";
import {
  campaignIdParamSchema,
  sessionParamsSchema,
  sessionUploadMetadataSchema,
  sessionListQuerySchema,
  updateSummarySchema,
  createMarkerSchema,
  updateMarkerSchema,
  markersQuerySchema,
  deleteMarkerQuerySchema,
  isSupportedAudioMimeType,
  SUPPORTED_AUDIO_MIME_TYPES,
} from "./schemas.js";
import {
  createSession,
  findSessionsByCampaignId,
  findSessionByIdAndCampaignId,
  findTranscriptBySessionId,
  addMarkerToTranscript,
  updateMarkerInTranscript,
  deleteMarkerFromTranscript,
  findSummaryBySessionId,
  createSummary,
  updateSummary,
} from "./repository.js";

const storage = createStorageService();

interface TranscriptionJobData {
  sessionId: string;
  campaignId: string;
  userId: string;
  audioPath: string;
  mimeType: string;
  [key: string]: unknown;
}

interface SummaryJobData {
  sessionId: string;
  campaignId: string;
  [key: string]: unknown;
}

interface TranscriptIndexingJobData {
  sessionId: string;
  campaignId: string;
  userId: string;
  [key: string]: unknown;
}

const transcriptionQueue = createQueue<TranscriptionJobData>(
  "session-transcription"
);

const summaryQueue = createQueue<SummaryJobData>("session-summary");

const transcriptIndexingQueue = createQueue<TranscriptIndexingJobData>(
  "transcript-indexing",
);

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/sessions - Upload audio and create session
  app.post("/:campaignId/sessions", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    // Parse multipart form data
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "No file uploaded",
      });
    }

    // Validate audio MIME type
    const mimeType = data.mimetype;
    if (!isSupportedAudioMimeType(mimeType)) {
      const supportedTypes = [
        ...new Set(Object.values(SUPPORTED_AUDIO_MIME_TYPES)),
      ].join(", ");
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `Unsupported audio format: ${mimeType}. Supported formats: ${supportedTypes}`,
      });
    }

    // Generate session ID and storage path
    const sessionId = randomUUID();
    const audioPath = `campaigns/${campaignId}/sessions/${sessionId}`;

    // Read file content as buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    const fileSize = fileBuffer.length;

    // Parse optional metadata from form fields
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.fields)) {
      if (value && typeof value === "object" && "value" in value) {
        fields[key] = String(value.value);
      }
    }

    const metadataResult = sessionUploadMetadataSchema.safeParse(fields);
    const metadata = metadataResult.success ? metadataResult.data : {};

    // Upload to S3 using an explicit key for session audio
    const uploadResult = await storage.uploadByKey(
      audioPath,
      fileBuffer,
      {
        contentType: mimeType,
        metadata: {
          originalFilename: data.filename,
        },
      }
    );

    if (!uploadResult.ok) {
      request.log.error(
        { error: uploadResult.error },
        "Failed to upload audio file to storage"
      );
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to upload audio file",
      });
    }

    // Create session record
    const session = await createSession({
      id: sessionId,
      campaignId,
      createdBy: userId,
      title:
        metadata.title ??
        data.filename.replace(/\.[^/.]+$/, ""),
      date: metadata.date ? new Date(metadata.date) : new Date(),
      status: "processing",
      audioPath,
      duration: null,
    });

    if (!session) {
      request.log.error(
        { campaignId, sessionId },
        "Failed to create session record"
      );
      await storage.deleteByKey(uploadResult.value.key);
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create session record",
      });
    }

    // Queue for transcription
    const queueResult = await transcriptionQueue.add(
      "transcribe-session",
      {
        sessionId,
        campaignId,
        userId,
        audioPath,
        mimeType,
      }
    );

    if (!queueResult.ok) {
      request.log.warn(
        { error: queueResult.error, sessionId },
        "Failed to queue session for transcription"
      );
    }

    trackEvent(userId, "session_audio_uploaded", {
      session_id: sessionId,
      campaign_id: campaignId,
      mime_type: mimeType,
      file_size: fileSize,
    });

    return reply.status(201).send({ session });
  });

  // GET /api/campaigns/:campaignId/sessions - List sessions
  app.get("/:campaignId/sessions", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const queryResult = sessionListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const sessions = await findSessionsByCampaignId(campaignId, {
      status: queryResult.data.status,
      limit: queryResult.data.limit,
      offset: queryResult.data.offset,
    });

    return reply.status(200).send({ sessions });
  });

  // GET /api/campaigns/:campaignId/sessions/:id - Get session details
  app.get("/:campaignId/sessions/:id", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    return reply.status(200).send({ session });
  });

  // GET /api/campaigns/:campaignId/sessions/:id/transcript - Get session transcript
  app.get("/:campaignId/sessions/:id/transcript", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const transcript = await findTranscriptBySessionId(id);
    if (!transcript) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Transcript not found",
      });
    }

    return reply.status(200).send({ transcript });
  });

  // POST /api/campaigns/:campaignId/sessions/:id/markers - Add marker
  app.post("/:campaignId/sessions/:id/markers", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const transcript = await findTranscriptBySessionId(id);
    if (!transcript) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Transcript not found",
      });
    }

    const bodyResult = createMarkerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const marker = {
      time: bodyResult.data.time,
      label: bodyResult.data.label,
      type: bodyResult.data.type ?? "general",
      notes: bodyResult.data.notes ?? null,
    };

    const updated = await addMarkerToTranscript(id, marker);
    if (!updated) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to add marker",
      });
    }

    trackEvent(userId, "session_marker_added", {
      session_id: id,
      campaign_id: campaignId,
      marker_type: marker.type,
    });

    return reply.status(201).send({ marker });
  });

  // PATCH /api/campaigns/:campaignId/sessions/:id/markers - Update marker
  app.patch("/:campaignId/sessions/:id/markers", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const bodyResult = updateMarkerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const { originalTime, originalLabel, ...raw } = bodyResult.data;

    // Strip undefined keys so the type satisfies exactOptionalPropertyTypes
    const updates: Partial<{ time: number; label: string; type: string; notes: string | null }> = {};
    if (raw.label !== undefined) updates.label = raw.label;
    if (raw.time !== undefined) updates.time = raw.time;
    if (raw.type !== undefined) updates.type = raw.type;
    if (raw.notes !== undefined) updates.notes = raw.notes;

    const updated = await updateMarkerInTranscript(
      id,
      originalTime,
      originalLabel,
      updates
    );
    if (!updated) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Transcript not found",
      });
    }

    return reply.status(200).send({ markers: updated.markers ?? [] });
  });

  // GET /api/campaigns/:campaignId/sessions/:id/markers - Get markers
  app.get("/:campaignId/sessions/:id/markers", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const transcript = await findTranscriptBySessionId(id);
    if (!transcript) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Transcript not found",
      });
    }

    const queryResult = markersQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const markers = transcript.markers ?? [];

    // If context is requested, include surrounding transcript segments
    if (queryResult.data.context) {
      const { window } = queryResult.data;
      const segments = transcript.segments ?? [];

      const markersWithContext = markers.map((marker) => {
        const windowStart = marker.time - window;
        const windowEnd = marker.time + window;

        const contextSegments = segments.filter(
          (seg) => seg.endTime >= windowStart && seg.startTime <= windowEnd
        );

        return { marker, segments: contextSegments };
      });

      return reply.status(200).send({ markers: markersWithContext });
    }

    return reply.status(200).send({ markers });
  });

  // DELETE /api/campaigns/:campaignId/sessions/:id/markers - Delete marker
  app.delete("/:campaignId/sessions/:id/markers", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const queryResult = deleteMarkerQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const updated = await deleteMarkerFromTranscript(
      id,
      queryResult.data.time,
      queryResult.data.label
    );
    if (!updated) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Transcript not found",
      });
    }

    return reply.status(200).send({ markers: updated.markers ?? [] });
  });

  // GET /api/campaigns/:campaignId/sessions/:id/audio - Get signed audio URL
  app.get("/:campaignId/sessions/:id/audio", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    if (!session.audioPath) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "No audio available for this session",
      });
    }

    const urlResult = await storage.getSignedUrlByKey(session.audioPath, 3600);
    if (!urlResult.ok) {
      request.log.error(
        { error: urlResult.error, sessionId: id },
        "Failed to generate signed URL for session audio"
      );
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to generate audio URL",
      });
    }

    return reply.status(200).send({
      url: urlResult.value.url,
      expiresAt: urlResult.value.expiresAt.toISOString(),
    });
  });

  // POST /api/campaigns/:campaignId/sessions/:id/summary - Generate summary
  app.post("/:campaignId/sessions/:id/summary", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    if (session.status !== "ready") {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Session transcript must be ready before generating a summary",
      });
    }

    if (isStripeConfigured()) {
      const limit = await checkUsageLimit(userId, "sessionSummaries");
      if (!limit.allowed) {
        return reply.status(402).send({
          statusCode: 402,
          error: "Payment Required",
          message: `Session summary limit reached (${limit.current}/${limit.limit}). Please upgrade your plan.`,
          feature: "sessionSummaries",
          current: limit.current,
          limit: limit.limit,
        });
      }
    }

    // Check if a summary already exists
    const existing = await findSummaryBySessionId(id);
    if (existing && existing.status === "generating") {
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Summary generation is already in progress",
      });
    }

    // Create or reset the summary record
    let summary;
    if (existing) {
      summary = await updateSummary(existing.id, {
        status: "generating",
        generationError: null,
        content: "",
        keyEvents: [],
        npcsEncountered: [],
        locationsVisited: [],
        itemsAcquired: [],
        openQuestions: [],
      });
    } else {
      summary = await createSummary({
        sessionId: id,
        status: "generating",
      });
    }

    if (!summary) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create summary record",
      });
    }

    // Queue for generation
    const queueResult = await summaryQueue.add("generate-summary", {
      sessionId: id,
      campaignId,
    });

    if (!queueResult.ok) {
      request.log.warn(
        { error: queueResult.error, sessionId: id },
        "Failed to queue summary generation"
      );
    }

    if (isStripeConfigured()) {
      await recordUsage(userId, "sessionSummaries");
    }

    trackEvent(userId, "session_summary_requested", {
      session_id: id,
      campaign_id: campaignId,
    });

    return reply.status(202).send({ summary });
  });

  // GET /api/campaigns/:campaignId/sessions/:id/summary - Get summary
  app.get("/:campaignId/sessions/:id/summary", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const summary = await findSummaryBySessionId(id);
    if (!summary) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Summary not found",
      });
    }

    return reply.status(200).send({ summary });
  });

  // PATCH /api/campaigns/:campaignId/sessions/:id/summary - Edit summary
  app.patch("/:campaignId/sessions/:id/summary", async (request, reply) => {
    const paramResult = sessionParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const session = await findSessionByIdAndCampaignId(id, campaignId);
    if (!session) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Session not found",
      });
    }

    const summary = await findSummaryBySessionId(id);
    if (!summary) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Summary not found. Generate a summary first.",
      });
    }

    const bodyResult = updateSummarySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    // Filter out undefined values for exactOptionalPropertyTypes compatibility
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bodyResult.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const updated = await updateSummary(
      summary.id,
      updateData as Parameters<typeof updateSummary>[1],
    );
    if (!updated) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to update summary",
      });
    }

    trackEvent(userId, "session_summary_edited", {
      session_id: id,
      campaign_id: campaignId,
    });

    return reply.status(200).send({ summary: updated });
  });

  // POST /api/campaigns/:campaignId/sessions/reindex - Reindex all session transcripts for RAG
  app.post("/:campaignId/sessions/reindex", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    // Find all ready sessions
    const sessions = await findSessionsByCampaignId(campaignId, {
      status: "ready",
      limit: 500,
    });

    // Queue indexing for each session that has a transcript
    let queued = 0;
    for (const session of sessions) {
      const transcript = await findTranscriptBySessionId(session.id);
      if (!transcript) continue;

      const result = await transcriptIndexingQueue.add(
        "index-transcript",
        {
          sessionId: session.id,
          campaignId,
          userId,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );

      if (result.ok) queued++;
    }

    return reply.status(200).send({
      message: `Queued ${queued} transcript(s) for indexing`,
      queued,
      totalSessions: sessions.length,
    });
  });
}
