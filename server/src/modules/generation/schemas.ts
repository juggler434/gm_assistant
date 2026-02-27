// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const generateHooksParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type GenerateHooksParam = z.infer<typeof generateHooksParamSchema>;

export const generateHooksBodySchema = z.object({
  tone: z.enum([
    "dark",
    "comedic",
    "political",
    "mysterious",
    "heroic",
    "horror",
    "intrigue",
  ]),
  theme: z.string().max(200).optional(),
  count: z.number().int().min(1).max(10).optional(),
  partyLevel: z.number().int().min(1).max(20).optional(),
  includeNpcsLocations: z.string().max(500).optional(),
});

export type GenerateHooksBody = z.infer<typeof generateHooksBodySchema>;

export const generateNpcsParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type GenerateNpcsParam = z.infer<typeof generateNpcsParamSchema>;

export const generateNpcsBodySchema = z.object({
  tone: z.enum(["dark", "comedic", "mysterious", "heroic", "gritty", "whimsical"]),
  race: z.string().max(100).optional(),
  classRole: z.string().max(100).optional(),
  level: z.string().max(50).optional(),
  importance: z.enum(["major", "minor", "background"]).optional(),
  count: z.number().int().min(1).max(5).optional(),
  includeStatBlock: z.boolean().optional(),
  constraints: z.string().max(500).optional(),
});

export type GenerateNpcsBody = z.infer<typeof generateNpcsBodySchema>;
