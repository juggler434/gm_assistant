// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import type { DocumentType } from "@/db/schema/documents.js";

// Supported MIME types
export const SUPPORTED_MIME_TYPES = {
  // Documents
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  // Images
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type SupportedMimeType = keyof typeof SUPPORTED_MIME_TYPES;

// File extensions for validation
export const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

// MIME types that are images
export const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

// MIME types that are documents
export const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Infer document type from MIME type and optional user hint.
 */
export function inferDocumentType(
  mimeType: string,
  hint?: DocumentType
): DocumentType {
  if (hint) return hint;

  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return "image";
  }

  // Default text documents to 'notes' - user can change later
  return "notes";
}

/**
 * Check if a MIME type is supported.
 */
export function isSupportedMimeType(
  mimeType: string
): mimeType is SupportedMimeType {
  return mimeType in SUPPORTED_MIME_TYPES;
}

// Document type values for Zod enum
const documentTypeValues = [
  "rulebook",
  "setting",
  "notes",
  "map",
  "image",
] as const;

// Schema for URL params with campaignId
export const campaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type CampaignIdParam = z.infer<typeof campaignIdParamSchema>;

// Schema for URL params with campaignId and documentId
export const documentParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid document ID"),
});

export type DocumentParams = z.infer<typeof documentParamsSchema>;

// Schema for document upload metadata (from form fields)
export const uploadMetadataSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  documentType: z.enum(documentTypeValues).optional(),
  tags: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          return parsed.filter((t): t is string => typeof t === "string");
        }
        return [];
      } catch {
        // If not JSON, treat as comma-separated
        return val
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    })
    .optional(),
});

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

// Schema for document list query params
export const documentListQuerySchema = z.object({
  status: z.enum(["pending", "processing", "ready", "failed"]).optional(),
  documentType: z.enum(documentTypeValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
