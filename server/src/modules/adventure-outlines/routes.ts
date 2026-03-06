// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  adventureOutlineCampaignIdParamSchema,
  adventureOutlineParamsSchema,
  createAdventureOutlineSchema,
  updateAdventureOutlineSchema,
  adventureOutlineListQuerySchema,
} from "./schemas.js";
import {
  createAdventureOutline,
  findAdventureOutlinesByCampaignId,
  findAdventureOutlineByIdAndCampaignId,
  updateAdventureOutline,
  deleteAdventureOutline,
} from "./repository.js";

export async function adventureOutlineRoutes(app: FastifyInstance): Promise<void> {
  // All adventure outline routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/adventure-outlines - Create adventure outline
  app.post("/:campaignId/adventure-outlines", async (request, reply) => {
    const paramResult = adventureOutlineCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createAdventureOutlineSchema.safeParse(request.body);
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
      title,
      description,
      acts,
      npcs,
      locations,
      factions,
      tags,
      isGenerated,
      notes,
    } = bodyResult.data;

    const outline = await createAdventureOutline({
      campaignId,
      createdBy: userId,
      title,
      description,
      acts,
      npcs: npcs ?? null,
      locations: locations ?? null,
      factions: factions ?? null,
      tags: tags ?? null,
      isGenerated: isGenerated ?? false,
      notes: notes ?? null,
    });

    if (!outline) {
      request.log.error({ userId, campaignId }, "Failed to create adventure outline");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create adventure outline",
      });
    }

    trackEvent(userId, "adventure_outline_created", {
      campaign_id: campaignId,
      adventure_outline_id: outline.id,
      is_generated: outline.isGenerated,
    });

    return reply.status(201).send({ adventureOutline: outline });
  });

  // GET /api/campaigns/:campaignId/adventure-outlines - List adventure outlines
  app.get("/:campaignId/adventure-outlines", async (request, reply) => {
    const paramResult = adventureOutlineCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const queryResult = adventureOutlineListQuerySchema.safeParse(request.query);
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

    const adventureOutlines = await findAdventureOutlinesByCampaignId(campaignId, {
      search,
      limit,
      offset,
    });

    return reply.status(200).send({ adventureOutlines });
  });

  // GET /api/campaigns/:campaignId/adventure-outlines/:id - Get adventure outline detail
  app.get("/:campaignId/adventure-outlines/:id", async (request, reply) => {
    const paramResult = adventureOutlineParamsSchema.safeParse(request.params);
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

    const outline = await findAdventureOutlineByIdAndCampaignId(id, campaignId);
    if (!outline) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure outline not found",
      });
    }

    return reply.status(200).send({ adventureOutline: outline });
  });

  // PATCH /api/campaigns/:campaignId/adventure-outlines/:id - Update adventure outline
  app.patch("/:campaignId/adventure-outlines/:id", async (request, reply) => {
    const paramResult = adventureOutlineParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const bodyResult = updateAdventureOutlineSchema.safeParse(request.body);
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

    const outline = await updateAdventureOutline(id, campaignId, updateData);
    if (!outline) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure outline not found",
      });
    }

    return reply.status(200).send({ adventureOutline: outline });
  });

  // DELETE /api/campaigns/:campaignId/adventure-outlines/:id - Delete adventure outline
  app.delete("/:campaignId/adventure-outlines/:id", async (request, reply) => {
    const paramResult = adventureOutlineParamsSchema.safeParse(request.params);
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

    const outline = await deleteAdventureOutline(id, campaignId);
    if (!outline) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure outline not found",
      });
    }

    trackEvent(userId, "adventure_outline_deleted", {
      campaign_id: campaignId,
      adventure_outline_id: id,
    });

    return reply.status(204).send();
  });
}
