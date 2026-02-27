// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const npcCampaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type NpcCampaignIdParam = z.infer<typeof npcCampaignIdParamSchema>;

export const npcParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid NPC ID"),
});

export type NpcParams = z.infer<typeof npcParamsSchema>;

export const createNpcSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  race: z.string().max(100).nullable().optional(),
  classRole: z.string().max(100).nullable().optional(),
  level: z.string().max(50).nullable().optional(),
  appearance: z.string().max(5000).nullable().optional(),
  personality: z.string().max(5000).nullable().optional(),
  motivations: z.string().max(5000).nullable().optional(),
  secrets: z.string().max(5000).nullable().optional(),
  backstory: z.string().max(10000).nullable().optional(),
  statBlock: z.record(z.string(), z.unknown()).nullable().optional(),
  importance: z.enum(["major", "minor", "background"]).optional(),
  status: z.enum(["alive", "dead", "unknown", "missing"]).optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type CreateNpcBody = z.infer<typeof createNpcSchema>;

export const updateNpcSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  race: z.string().max(100).nullable().optional(),
  classRole: z.string().max(100).nullable().optional(),
  level: z.string().max(50).nullable().optional(),
  appearance: z.string().max(5000).nullable().optional(),
  personality: z.string().max(5000).nullable().optional(),
  motivations: z.string().max(5000).nullable().optional(),
  secrets: z.string().max(5000).nullable().optional(),
  backstory: z.string().max(10000).nullable().optional(),
  statBlock: z.record(z.string(), z.unknown()).nullable().optional(),
  importance: z.enum(["major", "minor", "background"]).optional(),
  status: z.enum(["alive", "dead", "unknown", "missing"]).optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateNpcBody = z.infer<typeof updateNpcSchema>;

export const npcListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["alive", "dead", "unknown", "missing"]).optional(),
  importance: z.enum(["major", "minor", "background"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type NpcListQuery = z.infer<typeof npcListQuerySchema>;
