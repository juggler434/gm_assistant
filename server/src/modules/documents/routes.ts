import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { createStorageService } from "@/services/storage/index.js";
import { createQueue } from "@/jobs/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  campaignIdParamSchema,
  documentParamsSchema,
  uploadMetadataSchema,
  documentListQuerySchema,
  isSupportedMimeType,
  inferDocumentType,
  SUPPORTED_MIME_TYPES,
} from "./schemas.js";
import {
  createDocument,
  findDocumentsByCampaignId,
  findDocumentByIdAndCampaignId,
  deleteDocument,
} from "./repository.js";

// Initialize storage service
const storage = createStorageService();

// Job queue for document processing (will be processed by worker)
interface DocumentProcessingJobData {
  documentId: string;
  campaignId: string;
  storagePath: string;
  mimeType: string;
  [key: string]: unknown;
}

const documentProcessingQueue = createQueue<DocumentProcessingJobData>(
  "document-processing"
);

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // All document routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/documents - Upload document
  app.post("/:campaignId/documents", async (request, reply) => {
    // Validate campaign ID
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

    // Validate MIME type
    const mimeType = data.mimetype;
    if (!isSupportedMimeType(mimeType)) {
      const supportedTypes = Object.values(SUPPORTED_MIME_TYPES).join(", ");
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `Unsupported file type: ${mimeType}. Supported types: ${supportedTypes}`,
      });
    }

    // Parse optional metadata from form fields
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.fields)) {
      if (value && typeof value === "object" && "value" in value) {
        fields[key] = String(value.value);
      }
    }

    const metadataResult = uploadMetadataSchema.safeParse(fields);
    const metadata = metadataResult.success ? metadataResult.data : {};

    // Generate document ID and storage path
    const documentId = randomUUID();
    const storagePath = `campaigns/${campaignId}/documents/${documentId}`;

    // Read file content as buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    const fileSize = fileBuffer.length;

    // Upload to storage
    const uploadResult = await storage.upload(campaignId, documentId, fileBuffer, {
      contentType: mimeType,
      metadata: {
        originalFilename: data.filename,
      },
    });

    if (!uploadResult.ok) {
      request.log.error(
        { error: uploadResult.error },
        "Failed to upload file to storage"
      );
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to upload file",
      });
    }

    // Determine document type
    const documentType = inferDocumentType(mimeType, metadata.documentType);

    // Create document record
    const document = await createDocument({
      id: documentId,
      campaignId,
      uploadedBy: userId,
      name: metadata.name ?? data.filename,
      originalFilename: data.filename,
      mimeType,
      fileSize,
      storagePath,
      documentType,
      tags: metadata.tags ?? [],
      status: "pending",
    });

    if (!document) {
      // Clean up uploaded file if document creation fails
      await storage.delete(campaignId, documentId);
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create document record",
      });
    }

    // Queue document for processing
    const queueResult = await documentProcessingQueue.add(
      "process-document",
      {
        documentId,
        campaignId,
        storagePath,
        mimeType,
      }
    );

    if (!queueResult.ok) {
      request.log.warn(
        { error: queueResult.error, documentId },
        "Failed to queue document for processing"
      );
      // Don't fail the request - document is created, just not queued
      // Worker can pick it up later via status check
    }

    trackEvent(userId, "document_uploaded", {
      document_id: documentId,
      campaign_id: campaignId,
      mime_type: mimeType,
      file_size: fileSize,
      document_type: documentType,
    });

    return reply.status(201).send({ document });
  });

  // GET /api/campaigns/:campaignId/documents - List documents
  app.get("/:campaignId/documents", async (request, reply) => {
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

    // Parse query params
    const queryResult = documentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const documents = await findDocumentsByCampaignId(campaignId, {
      status: queryResult.data.status,
      documentType: queryResult.data.documentType,
      limit: queryResult.data.limit,
      offset: queryResult.data.offset,
    });

    return reply.status(200).send({ documents });
  });

  // GET /api/campaigns/:campaignId/documents/:id - Get document details
  app.get("/:campaignId/documents/:id", async (request, reply) => {
    const paramResult = documentParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
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

    const document = await findDocumentByIdAndCampaignId(id, campaignId);
    if (!document) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Document not found",
      });
    }

    return reply.status(200).send({ document });
  });

  // GET /api/campaigns/:campaignId/documents/:id/download - Get download URL
  app.get("/:campaignId/documents/:id/download", async (request, reply) => {
    const paramResult = documentParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
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

    const document = await findDocumentByIdAndCampaignId(id, campaignId);
    if (!document) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Document not found",
      });
    }

    // Generate signed URL (valid for 1 hour)
    const urlResult = await storage.getSignedUrl(campaignId, id, 3600);
    if (!urlResult.ok) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to generate download URL",
      });
    }

    return reply.status(200).send({
      url: urlResult.value.url,
      expiresAt: urlResult.value.expiresAt.toISOString(),
    });
  });

  // DELETE /api/campaigns/:campaignId/documents/:id - Delete document
  app.delete("/:campaignId/documents/:id", async (request, reply) => {
    const paramResult = documentParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
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

    // Delete document record (will also delete from storage)
    const document = await deleteDocument(id, campaignId);
    if (!document) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Document not found",
      });
    }

    // Delete from storage (ignore errors - file may not exist)
    await storage.delete(campaignId, id);

    trackEvent(userId, "document_deleted", {
      document_id: id,
      campaign_id: campaignId,
    });

    return reply.status(204).send();
  });
}
