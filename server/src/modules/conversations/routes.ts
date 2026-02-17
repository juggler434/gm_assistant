// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import {
  conversationCampaignParamSchema,
  conversationDetailParamSchema,
  createConversationSchema,
  addMessagesSchema,
} from "./schemas.js";
import {
  createConversation,
  findConversationsByCampaignAndUser,
  findConversationById,
  findMessagesByConversationId,
  addMessages,
  touchConversation,
  deleteConversation,
} from "./repository.js";

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // GET /api/campaigns/:campaignId/conversations - List conversations
  app.get("/:campaignId/conversations", async (request, reply) => {
    const paramResult = conversationCampaignParamSchema.safeParse(
      request.params
    );
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
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

    const conversations = await findConversationsByCampaignAndUser(
      campaignId,
      userId
    );

    return reply.status(200).send({ conversations });
  });

  // POST /api/campaigns/:campaignId/conversations - Create conversation
  app.post("/:campaignId/conversations", async (request, reply) => {
    const paramResult = conversationCampaignParamSchema.safeParse(
      request.params
    );
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    const bodyResult = createConversationSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Validation failed",
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

    const conversation = await createConversation({
      campaignId,
      userId,
      title: bodyResult.data.title,
    });

    if (!conversation) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create conversation",
      });
    }

    return reply.status(201).send({ conversation });
  });

  // GET /api/campaigns/:campaignId/conversations/:conversationId - Get conversation with messages
  app.get(
    "/:campaignId/conversations/:conversationId",
    async (request, reply) => {
      const paramResult = conversationDetailParamSchema.safeParse(
        request.params
      );
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            paramResult.error.issues[0]?.message ?? "Invalid parameters",
        });
      }

      const { campaignId, conversationId } = paramResult.data;
      const userId = request.userId!;

      const conversation = await findConversationById(
        conversationId,
        campaignId,
        userId
      );
      if (!conversation) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Conversation not found",
        });
      }

      const messages = await findMessagesByConversationId(conversationId);

      return reply.status(200).send({
        conversation: { ...conversation, messages },
      });
    }
  );

  // POST /api/campaigns/:campaignId/conversations/:conversationId/messages - Add messages
  app.post(
    "/:campaignId/conversations/:conversationId/messages",
    async (request, reply) => {
      const paramResult = conversationDetailParamSchema.safeParse(
        request.params
      );
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            paramResult.error.issues[0]?.message ?? "Invalid parameters",
        });
      }

      const bodyResult = addMessagesSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            bodyResult.error.issues[0]?.message ?? "Validation failed",
        });
      }

      const { campaignId, conversationId } = paramResult.data;
      const userId = request.userId!;

      const conversation = await findConversationById(
        conversationId,
        campaignId,
        userId
      );
      if (!conversation) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Conversation not found",
        });
      }

      const messagesToInsert = bodyResult.data.messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
        sources: m.sources ?? null,
        confidence: m.confidence ?? null,
      }));

      const saved = await addMessages(messagesToInsert);
      await touchConversation(conversationId);

      return reply.status(201).send({ messages: saved });
    }
  );

  // DELETE /api/campaigns/:campaignId/conversations/:conversationId - Delete conversation
  app.delete(
    "/:campaignId/conversations/:conversationId",
    async (request, reply) => {
      const paramResult = conversationDetailParamSchema.safeParse(
        request.params
      );
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            paramResult.error.issues[0]?.message ?? "Invalid parameters",
        });
      }

      const { campaignId, conversationId } = paramResult.data;
      const userId = request.userId!;

      const deleted = await deleteConversation(
        conversationId,
        campaignId,
        userId
      );
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Conversation not found",
        });
      }

      return reply.status(204).send();
    }
  );
}
