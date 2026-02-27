// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  npcCampaignIdParamSchema,
  npcParamsSchema,
  createNpcSchema,
  updateNpcSchema,
  npcListQuerySchema,
} from "./schemas.js";
import {
  createNpc,
  findNpcsByCampaignId,
  findNpcByIdAndCampaignId,
  updateNpc,
  deleteNpc,
} from "./repository.js";

export async function npcRoutes(app: FastifyInstance): Promise<void> {
  // All NPC routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/npcs - Create NPC
  app.post("/:campaignId/npcs", async (request, reply) => {
    const paramResult = npcCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createNpcSchema.safeParse(request.body);
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
      race,
      classRole,
      level,
      appearance,
      personality,
      motivations,
      secrets,
      backstory,
      statBlock,
      importance,
      status,
      tags,
      isGenerated,
      notes,
    } = bodyResult.data;

    const npc = await createNpc({
      campaignId,
      createdBy: userId,
      name,
      race: race ?? null,
      classRole: classRole ?? null,
      level: level ?? null,
      appearance: appearance ?? null,
      personality: personality ?? null,
      motivations: motivations ?? null,
      secrets: secrets ?? null,
      backstory: backstory ?? null,
      statBlock: statBlock ?? null,
      importance: importance ?? "minor",
      status: status ?? "alive",
      tags: tags ?? null,
      isGenerated: isGenerated ?? false,
      notes: notes ?? null,
    });

    if (!npc) {
      request.log.error({ userId, campaignId }, "Failed to create NPC");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create NPC",
      });
    }

    trackEvent(userId, "npc_created", {
      campaign_id: campaignId,
      npc_id: npc.id,
      is_generated: npc.isGenerated,
    });

    return reply.status(201).send({ npc });
  });

  // GET /api/campaigns/:campaignId/npcs - List NPCs
  app.get("/:campaignId/npcs", async (request, reply) => {
    const paramResult = npcCampaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const queryResult = npcListQuerySchema.safeParse(request.query);
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

    const { search, status, importance, limit, offset } = queryResult.data;

    const npcs = await findNpcsByCampaignId(campaignId, {
      search,
      status,
      importance,
      limit,
      offset,
    });

    return reply.status(200).send({ npcs });
  });

  // GET /api/campaigns/:campaignId/npcs/:id - Get NPC detail
  app.get("/:campaignId/npcs/:id", async (request, reply) => {
    const paramResult = npcParamsSchema.safeParse(request.params);
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

    const npc = await findNpcByIdAndCampaignId(id, campaignId);
    if (!npc) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "NPC not found",
      });
    }

    return reply.status(200).send({ npc });
  });

  // PATCH /api/campaigns/:campaignId/npcs/:id - Update NPC
  app.patch("/:campaignId/npcs/:id", async (request, reply) => {
    const paramResult = npcParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid parameters",
      });
    }

    const bodyResult = updateNpcSchema.safeParse(request.body);
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

    const npc = await updateNpc(id, campaignId, updateData);
    if (!npc) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "NPC not found",
      });
    }

    return reply.status(200).send({ npc });
  });

  // DELETE /api/campaigns/:campaignId/npcs/:id - Delete NPC
  app.delete("/:campaignId/npcs/:id", async (request, reply) => {
    const paramResult = npcParamsSchema.safeParse(request.params);
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

    const npc = await deleteNpc(id, campaignId);
    if (!npc) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "NPC not found",
      });
    }

    trackEvent(userId, "npc_deleted", {
      campaign_id: campaignId,
      npc_id: id,
    });

    return reply.status(204).send();
  });
}
