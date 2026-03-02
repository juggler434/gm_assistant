// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

export const locationCampaignIdParamSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type LocationCampaignIdParam = z.infer<typeof locationCampaignIdParamSchema>;

export const locationParamsSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  id: z.string().uuid("Invalid location ID"),
});

export type LocationParams = z.infer<typeof locationParamsSchema>;

const sensoryDetailsSchema = z
  .object({
    sights: z.string().max(2000).optional(),
    sounds: z.string().max(2000).optional(),
    smells: z.string().max(2000).optional(),
  })
  .nullable()
  .optional();

export const createLocationSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  terrain: z.string().max(100).nullable().optional(),
  climate: z.string().max(100).nullable().optional(),
  size: z.string().max(50).nullable().optional(),
  readAloud: z.string().max(5000).nullable().optional(),
  keyFeatures: z.array(z.string().max(500)).max(20).nullable().optional(),
  pointsOfInterest: z.array(z.string().max(500)).max(20).nullable().optional(),
  encounters: z.array(z.string().max(500)).max(20).nullable().optional(),
  secrets: z.array(z.string().max(500)).max(20).nullable().optional(),
  npcsPresent: z.array(z.string().max(200)).max(20).nullable().optional(),
  factions: z.array(z.string().max(200)).max(20).nullable().optional(),
  sensoryDetails: sensoryDetailsSchema,
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type CreateLocationBody = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  terrain: z.string().max(100).nullable().optional(),
  climate: z.string().max(100).nullable().optional(),
  size: z.string().max(50).nullable().optional(),
  readAloud: z.string().max(5000).nullable().optional(),
  keyFeatures: z.array(z.string().max(500)).max(20).nullable().optional(),
  pointsOfInterest: z.array(z.string().max(500)).max(20).nullable().optional(),
  encounters: z.array(z.string().max(500)).max(20).nullable().optional(),
  secrets: z.array(z.string().max(500)).max(20).nullable().optional(),
  npcsPresent: z.array(z.string().max(200)).max(20).nullable().optional(),
  factions: z.array(z.string().max(200)).max(20).nullable().optional(),
  sensoryDetails: sensoryDetailsSchema,
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  isGenerated: z.boolean().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateLocationBody = z.infer<typeof updateLocationSchema>;

export const locationListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type LocationListQuery = z.infer<typeof locationListQuerySchema>;
