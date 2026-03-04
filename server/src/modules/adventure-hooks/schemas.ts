// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const adventureHookCampaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type AdventureHookCampaignIdParam = z.infer<typeof adventureHookCampaignIdParamSchema>;

export const adventureHookParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid adventure hook ID"),
});

export type AdventureHookParams = z.infer<typeof adventureHookParamsSchema>;

export const createAdventureHookSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().min(1, "Description is required").max(10000),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type CreateAdventureHookBody = z.infer<typeof createAdventureHookSchema>;

export const updateAdventureHookSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(10000).optional(),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateAdventureHookBody = z.infer<typeof updateAdventureHookSchema>;

export const adventureHookListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type AdventureHookListQuery = z.infer<typeof adventureHookListQuerySchema>;
