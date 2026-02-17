// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(5000).nullable().optional(),
});

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
});

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>;

export const campaignIdParamSchema = z.object({
  id: z.string().uuid("Invalid campaign ID"),
});

export type CampaignIdParam = z.infer<typeof campaignIdParamSchema>;
