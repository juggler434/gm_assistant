import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { createLLMService } from "@/services/llm/factory.js";
import { trackEvent } from "@/services/metrics/index.js";
import { generateAdventureHooks } from "./generators/adventure-hook.js";
import { generateHooksParamSchema, generateHooksBodySchema } from "./schemas.js";
import type { AdventureHookRequest } from "./types.js";

export async function generationRoutes(app: FastifyInstance): Promise<void> {
  // All generation routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/generate/hooks - Generate adventure hooks
  app.post("/:campaignId/generate/hooks", async (request, reply) => {
    // Validate params
    const paramResult = generateHooksParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: paramResult.error.issues[0]?.message ?? "Invalid campaign ID",
      });
    }

    // Validate body
    const bodyResult = generateHooksBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: bodyResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { campaignId } = paramResult.data;
    const { tone, theme, count, partyLevel } = bodyResult.data;
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

    // Check if client wants streaming via Accept header
    const acceptHeader = request.headers.accept ?? "";
    const wantsStream = acceptHeader.includes("text/event-stream");

    const hookRequest: AdventureHookRequest = {
      campaignId,
      tone,
      ...(theme !== undefined && { theme }),
      ...(partyLevel !== undefined && { partyLevel }),
      ...(count !== undefined && { maxContextChunks: Math.max(count, 6) }),
    };

    const llmService = createLLMService();

    if (wantsStream) {
      // SSE streaming response
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send a status event to indicate generation started
      reply.raw.write(`data: ${JSON.stringify({ type: "status", message: "Generating adventure hooks..." })}\n\n`);

      const result = await generateAdventureHooks(hookRequest, llmService);

      if (result.ok) {
        // Stream each hook individually
        for (const hook of result.value.hooks) {
          reply.raw.write(`data: ${JSON.stringify({ type: "hook", hook })}\n\n`);
        }

        // Send sources and metadata
        reply.raw.write(`data: ${JSON.stringify({
          type: "complete",
          sources: result.value.sources,
          chunksUsed: result.value.chunksUsed,
          usage: result.value.usage,
        })}\n\n`);

        trackEvent(userId, "hooks_generated", {
          campaign_id: campaignId,
          tone,
          theme: theme ?? null,
          hook_count: result.value.hooks.length,
        });
      } else {
        const statusCode = errorCodeToStatus(result.error.code);
        reply.raw.write(`data: ${JSON.stringify({
          type: "error",
          statusCode,
          error: result.error.code,
          message: result.error.message,
        })}\n\n`);
      }

      reply.raw.end();
      return reply;
    }

    // Standard JSON response
    const result = await generateAdventureHooks(hookRequest, llmService);

    if (!result.ok) {
      const statusCode = errorCodeToStatus(result.error.code);
      return reply.status(statusCode).send({
        statusCode,
        error: result.error.code,
        message: result.error.message,
      });
    }

    trackEvent(userId, "hooks_generated", {
      campaign_id: campaignId,
      tone,
      theme: theme ?? null,
      hook_count: result.value.hooks.length,
    });

    return reply.status(200).send({
      hooks: result.value.hooks,
      sources: result.value.sources,
      chunksUsed: result.value.chunksUsed,
      usage: result.value.usage,
    });
  });
}

function errorCodeToStatus(code: string): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    case "EMBEDDING_FAILED":
    case "SEARCH_FAILED":
    case "GENERATION_FAILED":
    case "PARSE_ERROR":
      return 502;
    default:
      return 500;
  }
}
