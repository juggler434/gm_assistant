// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { createStorageService } from "@/services/storage/index.js";
import { createQueue } from "@/jobs/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  campaignIdParamSchema,
  sessionParamsSchema,
  sessionUploadMetadataSchema,
  sessionListQuerySchema,
  isSupportedAudioMimeType,
  SUPPORTED_AUDIO_MIME_TYPES,
} from "./schemas.js";
import {
  createSession,
  findSessionsByCampaignId,
  findSessionByIdAndCampaignId,
  findTranscriptBySessionId,
} from "./repository.js";

const storage = createStorageService();

interface TranscriptionJobData {
  sessionId: string;
  campaignId: string;
  audioPath: string;
  mimeType: string;
  [key: string]: unknown;
}

const transcriptionQueue = createQueue<TranscriptionJobData>(
  "session-transcription"
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
}
