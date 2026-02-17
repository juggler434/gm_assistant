// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import { documentTypeEnum } from "@/db/schema/documents.js";

// Schema for URL params with campaignId
export const queryParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type QueryParam = z.infer<typeof queryParamSchema>;

// Schema for query request body
export const queryBodySchema = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty")
    .max(2000, "Query must be at most 2000 characters"),
  filters: z
    .object({
      documentTypes: z.array(z.enum(documentTypeEnum.enumValues)).optional(),
      tags: z.array(z.string()).optional(),
      documentIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export type QueryBody = z.infer<typeof queryBodySchema>;
