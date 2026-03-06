// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

const outlineActSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(10000),
  keyEvents: z.array(z.string().max(1000)).max(20),
  encounters: z.array(z.string().max(1000)).max(20),
});

export const adventureOutlineCampaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type AdventureOutlineCampaignIdParam = z.infer<typeof adventureOutlineCampaignIdParamSchema>;

export const adventureOutlineParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid adventure outline ID"),
});

export type AdventureOutlineParams = z.infer<typeof adventureOutlineParamsSchema>;

export const createAdventureOutlineSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().min(1, "Description is required").max(10000),
  acts: z.array(outlineActSchema).min(1).max(10),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type CreateAdventureOutlineBody = z.infer<typeof createAdventureOutlineSchema>;

export const updateAdventureOutlineSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(10000).optional(),
  acts: z.array(outlineActSchema).min(1).max(10).optional(),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateAdventureOutlineBody = z.infer<typeof updateAdventureOutlineSchema>;

export const adventureOutlineListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type AdventureOutlineListQuery = z.infer<typeof adventureOutlineListQuerySchema>;
