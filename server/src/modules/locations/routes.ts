// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  locationCampaignIdParamSchema,
  locationParamsSchema,
  createLocationSchema,
  updateLocationSchema,
  locationListQuerySchema,
} from "./schemas.js";
import {
  createLocation,
  findLocationsByCampaignId,
  findLocationByIdAndCampaignId,
  updateLocation,
  deleteLocation,
} from "./repository.js";

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  // All location routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/locations - Create location
  app.post("/:campaignId/locations", async (request, reply) => {
    const paramResult = locationCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createLocationSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const {
      name,
      terrain,
      climate,
      size,
      readAloud,
      keyFeatures,
      pointsOfInterest,
      encounters,
      secrets,
      npcsPresent,
      factions,
      sensoryDetails,
      tags,
      isGenerated,
      notes,
    } = bodyResult.data;

    const location = await createLocation({
      campaignId,
      createdBy: userId,
      name,
      terrain: terrain ?? null,
      climate: climate ?? null,
      size: size ?? null,
      readAloud: readAloud ?? null,
      keyFeatures: keyFeatures ?? null,
      pointsOfInterest: pointsOfInterest ?? null,
      encounters: encounters ?? null,
      secrets: secrets ?? null,
      npcsPresent: npcsPresent ?? null,
      factions: factions ?? null,
      sensoryDetails: sensoryDetails ?? null,
      tags: tags ?? null,
      isGenerated: isGenerated ?? false,
      notes: notes ?? null,
    });

    if (!location) {
      request.log.error({ userId, campaignId }, "Failed to create location");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create location",
      });
    }

    trackEvent(userId, "location_created", {
      campaign_id: campaignId,
      location_id: location.id,
      is_generated: location.isGenerated,
    });

    return reply.status(201).send({ location });
  });

  // GET /api/campaigns/:campaignId/locations - List locations
  app.get("/:campaignId/locations", async (request, reply) => {
    const paramResult = locationCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const queryResult = locationListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const { search, limit, offset } = queryResult.data;

    const locations = await findLocationsByCampaignId(campaignId, {
      search,
      limit,
      offset,
    });

    return reply.status(200).send({ locations });
  });

  // GET /api/campaigns/:campaignId/locations/:id - Get location detail
  app.get("/:campaignId/locations/:id", async (request, reply) => {
    const paramResult = locationParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const location = await findLocationByIdAndCampaignId(id, campaignId);
    if (!location) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Location not found",
      });
    }

    return reply.status(200).send({ location });
  });

  // PATCH /api/campaigns/:campaignId/locations/:id - Update location
  app.patch("/:campaignId/locations/:id", async (request, reply) => {
    const paramResult = locationParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const bodyResult = updateLocationSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;
    const updateData = bodyResult.data;

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "No fields to update",
      });
    }

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const location = await updateLocation(id, campaignId, updateData);
    if (!location) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Location not found",
      });
    }

    return reply.status(200).send({ location });
  });

  // DELETE /api/campaigns/:campaignId/locations/:id - Delete location
  app.delete("/:campaignId/locations/:id", async (request, reply) => {
    const paramResult = locationParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const location = await deleteLocation(id, campaignId);
    if (!location) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Location not found",
      });
    }

    trackEvent(userId, "location_deleted", {
      campaign_id: campaignId,
      location_id: id,
    });

    return reply.status(204).send();
  });
}
