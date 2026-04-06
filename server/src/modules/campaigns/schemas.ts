// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(5000).nullable().optional(),
});

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;

const generationSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  customInstructions: z.string().max(2000).optional(),
  defaultTones: z.object({
    hook: z.enum(["dark", "comedic", "political", "mysterious", "heroic", "horror", "intrigue"]).optional(),
    npc: z.enum(["dark", "comedic", "mysterious", "heroic", "gritty", "whimsical"]).optional(),
    location: z.enum(["dark", "peaceful", "mysterious", "bustling", "ruined", "magical"]).optional(),
    outline: z.enum(["dark", "comedic", "political", "mysterious", "heroic", "horror", "intrigue"]).optional(),
    adventure: z.enum(["dark", "comedic", "political", "mysterious", "heroic", "horror", "intrigue"]).optional(),
  }).optional(),
}).nullable();

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  generationSettings: generationSettingsSchema.optional(),
});

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>;

export const campaignIdParamSchema = z.object({
  id: z.string().uuid("Invalid campaign ID"),
});

export type CampaignIdParam = z.infer<typeof campaignIdParamSchema>;
