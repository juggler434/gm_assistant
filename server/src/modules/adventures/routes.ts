// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  adventureCampaignIdParamSchema,
  adventureParamsSchema,
  createAdventureSchema,
  updateAdventureSchema,
  adventureListQuerySchema,
} from "./schemas.js";
import {
  createAdventure,
  findAdventuresByCampaignId,
  findAdventureByIdAndCampaignId,
  updateAdventure,
  deleteAdventure,
} from "./repository.js";

export async function adventureRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/adventures - Create adventure
  app.post("/:campaignId/adventures", async (request, reply) => {
    const paramResult = adventureCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createAdventureSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const {
      title,
      synopsis,
      estimatedDuration,
      scenes,
      npcs,
      locations,
      factions,
      tags,
      isGenerated,
      sourceOutlineId,
      notes,
    } = bodyResult.data;

    const adventure = await createAdventure({
      campaignId,
      createdBy: userId,
      title,
      synopsis,
      estimatedDuration: estimatedDuration ?? null,
      scenes,
      npcs: npcs ?? null,
      locations: locations ?? null,
      factions: factions ?? null,
      tags: tags ?? null,
      isGenerated: isGenerated ?? false,
      sourceOutlineId: sourceOutlineId ?? null,
      notes: notes ?? null,
    });

    if (!adventure) {
      request.log.error({ userId, campaignId }, "Failed to create adventure");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create adventure",
      });
    }

    trackEvent(userId, "adventure_created", {
      campaign_id: campaignId,
      adventure_id: adventure.id,
      is_generated: adventure.isGenerated,
    });

    return reply.status(201).send({ adventure });
  });

  // GET /api/campaigns/:campaignId/adventures - List adventures
  app.get("/:campaignId/adventures", async (request, reply) => {
    const paramResult = adventureCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const queryResult = adventureListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: queryResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }

    const { campaignId } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const { search, limit, offset } = queryResult.data;
    const adventures = await findAdventuresByCampaignId(campaignId, { search, limit, offset });

    return reply.status(200).send({ adventures });
  });

  // GET /api/campaigns/:campaignId/adventures/:id - Get adventure detail
  app.get("/:campaignId/adventures/:id", async (request, reply) => {
    const paramResult = adventureParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const adventure = await findAdventureByIdAndCampaignId(id, campaignId);
    if (!adventure) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure not found",
      });
    }

    return reply.status(200).send({ adventure });
  });

  // PATCH /api/campaigns/:campaignId/adventures/:id - Update adventure
  app.patch("/:campaignId/adventures/:id", async (request, reply) => {
    const paramResult = adventureParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const bodyResult = updateAdventureSchema.safeParse(request.body);
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

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const adventure = await updateAdventure(id, campaignId, updateData);
    if (!adventure) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure not found",
      });
    }

    return reply.status(200).send({ adventure });
  });

  // DELETE /api/campaigns/:campaignId/adventures/:id - Delete adventure
  app.delete("/:campaignId/adventures/:id", async (request, reply) => {
    const paramResult = adventureParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const { campaignId, id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    const adventure = await deleteAdventure(id, campaignId);
    if (!adventure) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure not found",
      });
    }

    trackEvent(userId, "adventure_deleted", {
      campaign_id: campaignId,
      adventure_id: id,
    });

    return reply.status(204).send();
  });
}
