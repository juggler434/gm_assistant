import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
} from "./schemas.js";
import {
  createCampaign,
  findCampaignsByUserId,
  findCampaignByIdAndUserId,
  updateCampaign,
  deleteCampaign,
} from "./repository.js";

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  // All campaign routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns - Create campaign
  app.post("/", async (request, reply) => {
    const parseResult = createCampaignSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { name, description } = parseResult.data;
    const userId = request.userId!;

    const campaign = await createCampaign({
      userId,
      name,
      description: description ?? null,
    });

    if (!campaign) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create campaign",
      });
    }

    trackEvent(userId, "campaign_created", { campaign_id: campaign.id });

    return reply.status(201).send({ campaign });
  });

  // GET /api/campaigns - List user's campaigns
  app.get("/", async (request, reply) => {
    const userId = request.userId!;
    const campaigns = await findCampaignsByUserId(userId);
    return reply.status(200).send({ campaigns });
  });

  // GET /api/campaigns/:id - Get campaign details
  app.get("/:id", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const { id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await findCampaignByIdAndUserId(id, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    return reply.status(200).send({ campaign });
  });

  // PATCH /api/campaigns/:id - Update campaign
  app.patch("/:id", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = updateCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { id } = paramResult.data;
    const userId = request.userId!;
    const updateData = bodyResult.data;

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "No fields to update",
      });
    }

    const campaign = await updateCampaign(id, userId, updateData);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    return reply.status(200).send({ campaign });
  });

  // DELETE /api/campaigns/:id - Delete campaign
  app.delete("/:id", async (request, reply) => {
    const paramResult = campaignIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const { id } = paramResult.data;
    const userId = request.userId!;

    const campaign = await deleteCampaign(id, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    trackEvent(userId, "campaign_deleted", { campaign_id: id });

    return reply.status(204).send();
  });
}
