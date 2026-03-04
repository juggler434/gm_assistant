// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  adventureHookCampaignIdParamSchema,
  adventureHookParamsSchema,
  createAdventureHookSchema,
  updateAdventureHookSchema,
  adventureHookListQuerySchema,
} from "./schemas.js";
import {
  createAdventureHook,
  findAdventureHooksByCampaignId,
  findAdventureHookByIdAndCampaignId,
  updateAdventureHook,
  deleteAdventureHook,
} from "./repository.js";

export async function adventureHookRoutes(app: FastifyInstance): Promise<void> {
  // All adventure hook routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/adventure-hooks - Create adventure hook
  app.post("/:campaignId/adventure-hooks", async (request, reply) => {
    const paramResult = adventureHookCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createAdventureHookSchema.safeParse(request.body);
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
      npcs,
      locations,
      factions,
      tags,
      isGenerated,
      notes,
    } = bodyResult.data;

    const hook = await createAdventureHook({
      campaignId,
      createdBy: userId,
      title,
      description,
      npcs: npcs ?? null,
      locations: locations ?? null,
      factions: factions ?? null,
      tags: tags ?? null,
      isGenerated: isGenerated ?? false,
      notes: notes ?? null,
    });

    if (!hook) {
      request.log.error({ userId, campaignId }, "Failed to create adventure hook");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create adventure hook",
      });
    }

    trackEvent(userId, "adventure_hook_created", {
      campaign_id: campaignId,
      adventure_hook_id: hook.id,
      is_generated: hook.isGenerated,
    });

    return reply.status(201).send({ adventureHook: hook });
  });

  // GET /api/campaigns/:campaignId/adventure-hooks - List adventure hooks
  app.get("/:campaignId/adventure-hooks", async (request, reply) => {
    const paramResult = adventureHookCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const queryResult = adventureHookListQuerySchema.safeParse(request.query);
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

    const adventureHooks = await findAdventureHooksByCampaignId(campaignId, {
      search,
      limit,
      offset,
    });

    return reply.status(200).send({ adventureHooks });
  });

  // GET /api/campaigns/:campaignId/adventure-hooks/:id - Get adventure hook detail
  app.get("/:campaignId/adventure-hooks/:id", async (request, reply) => {
    const paramResult = adventureHookParamsSchema.safeParse(request.params);
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

    const hook = await findAdventureHookByIdAndCampaignId(id, campaignId);
    if (!hook) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure hook not found",
      });
    }

    return reply.status(200).send({ adventureHook: hook });
  });

  // PATCH /api/campaigns/:campaignId/adventure-hooks/:id - Update adventure hook
  app.patch("/:campaignId/adventure-hooks/:id", async (request, reply) => {
    const paramResult = adventureHookParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const bodyResult = updateAdventureHookSchema.safeParse(request.body);
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

    const hook = await updateAdventureHook(id, campaignId, updateData);
    if (!hook) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure hook not found",
      });
    }

    return reply.status(200).send({ adventureHook: hook });
  });

  // DELETE /api/campaigns/:campaignId/adventure-hooks/:id - Delete adventure hook
  app.delete("/:campaignId/adventure-hooks/:id", async (request, reply) => {
    const paramResult = adventureHookParamsSchema.safeParse(request.params);
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

    const hook = await deleteAdventureHook(id, campaignId);
    if (!hook) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Adventure hook not found",
      });
    }

    trackEvent(userId, "adventure_hook_deleted", {
      campaign_id: campaignId,
      adventure_hook_id: id,
    });

    return reply.status(204).send();
  });
}
