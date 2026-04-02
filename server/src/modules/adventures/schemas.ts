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

// Node-based adventure schemas

const factionGoalSchema = z.object({
  name: z.string().max(255),
  goal: z.string().max(2000),
  resources: z.string().max(2000),
});

const adventureFrontSchema = z.object({
  description: z.string().max(5000),
  stakes: z.string().max(2000),
  keyFactions: z.array(factionGoalSchema).max(10),
});

const nodeClueSchema = z.object({
  description: z.string().max(2000),
  pointsTo: z.string().max(50),
  type: z.enum(["evidence", "npc_info", "observation", "document", "trail"]),
  isHidden: z.boolean(),
});

const adventureNodeSchema = z.object({
  id: z.string().max(50),
  name: z.string().min(1).max(255),
  type: z.enum(["location", "event", "encounter", "social"]),
  description: z.string().min(1).max(10000),
  readAloud: z.string().max(5000),
  npcDialogue: z.array(npcDialogueLineSchema).max(20),
  encounters: z.array(sceneEncounterSchema).max(10),
  treasure: z.array(z.string().max(1000)).max(20),
  mapSuggestion: z.string().max(2000),
  clues: z.array(nodeClueSchema).max(20),
  isEntryPoint: z.boolean(),
});

const timelineEntrySchema = z.object({
  stage: z.number().int().min(1).max(20),
  label: z.string().max(255),
  event: z.string().max(2000),
  consequence: z.string().max(2000),
  nodesAffected: z.array(z.string().max(50)).max(20),
});

const adventureFormatSchema = z.enum(["linear", "node-based"]).default("linear");

export const createAdventureSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  synopsis: z.string().min(1, "Synopsis is required").max(10000),
  estimatedDuration: z.string().max(100).nullable().optional(),
  scenes: z.array(adventureSceneSchema).max(30).optional().default([]),
  adventureFormat: adventureFormatSchema.optional(),
  front: adventureFrontSchema.nullable().optional(),
  nodes: z.array(adventureNodeSchema).max(50).nullable().optional(),
  doomTimeline: z.array(timelineEntrySchema).max(20).nullable().optional(),
  npcs: z.array(z.string().max(255)).max(50).nullable().optional(),
  locations: z.array(z.string().max(255)).max(50).nullable().optional(),
  factions: z.array(z.string().max(255)).max(50).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  sourceOutlineId: z.string().uuid().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
}).superRefine((data, ctx) => {
  const format = data.adventureFormat ?? "linear";
  if (format === "linear" && (!data.scenes || data.scenes.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Linear adventures require at least one scene",
      path: ["scenes"],
    });
  }
  if (format === "node-based") {
    if (!data.front) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Node-based adventures require a front",
        path: ["front"],
      });
    }
    if (!data.nodes || data.nodes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Node-based adventures require at least one node",
        path: ["nodes"],
      });
    }
    if (!data.doomTimeline || data.doomTimeline.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Node-based adventures require at least one doom timeline entry",
        path: ["doomTimeline"],
      });
    }
  }
});

export type CreateAdventureBody = z.infer<typeof createAdventureSchema>;

export const updateAdventureSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  synopsis: z.string().min(1).max(10000).optional(),
  estimatedDuration: z.string().max(100).nullable().optional(),
  scenes: z.array(adventureSceneSchema).min(1).max(30).optional(),
  adventureFormat: adventureFormatSchema.optional(),
  front: adventureFrontSchema.nullable().optional(),
  nodes: z.array(adventureNodeSchema).max(50).nullable().optional(),
  doomTimeline: z.array(timelineEntrySchema).max(20).nullable().optional(),
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
