// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const conversationCampaignParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export const conversationDetailParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  conversationId: z.string().uuid("Invalid conversation ID"),
});

export const createConversationSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
});

export const addMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z
    .array(
      z.object({
        documentName: z.string(),
        documentId: z.string(),
        documentType: z.string(),
        pageNumber: z.number().nullable(),
        section: z.string().nullable(),
        relevanceScore: z.number(),
      })
    )
    .nullable()
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
});

export const addMessagesSchema = z.object({
  messages: z.array(addMessageSchema).min(1).max(2),
});
