// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

// Supported audio MIME types
export const SUPPORTED_AUDIO_MIME_TYPES = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
} as const;

export type SupportedAudioMimeType = keyof typeof SUPPORTED_AUDIO_MIME_TYPES;

/**
 * Check if a MIME type is a supported audio format.
 */
export function isSupportedAudioMimeType(
  mimeType: string
): mimeType is SupportedAudioMimeType {
  return mimeType in SUPPORTED_AUDIO_MIME_TYPES;
}

// Schema for URL params with campaignId
export const campaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

// Schema for URL params with campaignId and session id
export const sessionParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid session ID"),
});

// Schema for session upload metadata (from form fields)
export const sessionUploadMetadataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  date: z.string().datetime({ offset: true }).optional(),
});

// Schema for session list query params
export const sessionListQuerySchema = z.object({
  status: z.enum(["recording", "processing", "ready"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Schema for updating a session summary
export const updateSummarySchema = z.object({
  content: z.string().optional(),
  keyEvents: z.array(z.string()).optional(),
  npcsEncountered: z.array(z.string()).optional(),
  locationsVisited: z.array(z.string()).optional(),
  itemsAcquired: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
});
