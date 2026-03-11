// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

const npcDialogueLineSchema = z.object({
  npcName: z.string().max(255),
  dialogue: z.string().max(5000),
  context: z.string().max(1000),
});

const sceneEncounterSchema = z.object({
  name: z.string().max(255),
  description: z.string().max(5000),
  difficulty: z.string().max(50),
  creatures: z.array(z.string().max(255)).max(20),
  tactics: z.string().max(2000),
  statBlock: z.record(z.string(), z.unknown()).nullable(),
});

const adventureSceneSchema = z.object({
  title: z.string().min(1).max(255),
  actNumber: z.number().int().min(1).max(10),
  description: z.string().min(1).max(10000),
  readAloud: z.string().max(5000),
  npcDialogue: z.array(npcDialogueLineSchema).max(20),
  encounters: z.array(sceneEncounterSchema).max(10),
  treasure: z.array(z.string().max(1000)).max(20),
  mapSuggestion: z.string().max(2000),
});

export const adventureCampaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type AdventureCampaignIdParam = z.infer<typeof adventureCampaignIdParamSchema>;

export const adventureParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid adventure ID"),
});

export type AdventureParams = z.infer<typeof adventureParamsSchema>;

export const createAdventureSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  synopsis: z.string().min(1, "Synopsis is required").max(10000),
  estimatedDuration: z.string().max(100).nullable().optional(),
  scenes: z.array(adventureSceneSchema).min(1).max(30),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  sourceOutlineId: z.string().uuid().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type CreateAdventureBody = z.infer<typeof createAdventureSchema>;

export const updateAdventureSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  synopsis: z.string().min(1).max(10000).optional(),
  estimatedDuration: z.string().max(100).nullable().optional(),
  scenes: z.array(adventureSceneSchema).min(1).max(30).optional(),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateAdventureBody = z.infer<typeof updateAdventureSchema>;

export const adventureListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type AdventureListQuery = z.infer<typeof adventureListQuerySchema>;
