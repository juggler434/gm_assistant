// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/modules/auth/index.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/index.js";
import { checkUsageLimit, recordUsage, isStripeConfigured } from "@/modules/billing/index.js";
import { createLLMService } from "@/services/llm/index.js";
import { trackEvent } from "@/services/metrics/index.js";
import { executeRAGPipeline } from "./rag/index.js";
import { queryParamSchema, queryBodySchema, sessionQueryBodySchema } from "./schemas.js";
import {
  findDocumentIdsByTags,
  findTranscriptDocumentIds,
  findNonTranscriptDocumentIds,
} from "./repository.js";

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  // All query routes require authentication
  app.addHook("preHandler", requireAuth);

  // POST /api/campaigns/:campaignId/query - Query campaign documents
  app.post("/:campaignId/query", async (request, reply) => {
    // Validate campaign ID
    const paramResult = queryParamSchema.safeParse(request.params);
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

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    if (isStripeConfigured()) {
      const limit = await checkUsageLimit(userId, "ragQueries");
      if (!limit.allowed) {
        return reply.status(402).send({
          statusCode: 402,
          error: "Payment Required",
          message: `RAG query limit reached (${limit.current}/${limit.limit}). Please upgrade your plan.`,
          feature: "ragQueries",
          current: limit.current,
          limit: limit.limit,
        });
      }
    }

    // Validate request body
    const bodyResult = queryBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const { query, filters, conversationHistory } = bodyResult.data;

    // Resolve filters
    let documentIds: string[] | undefined = filters?.documentIds;
    const documentTypes = filters?.documentTypes;

    // If tags are provided, resolve them to document IDs
    if (filters?.tags && filters.tags.length > 0) {
      const tagDocIds = await findDocumentIdsByTags(campaignId, filters.tags);

      if (documentIds && documentIds.length > 0) {
        // Intersect tag-resolved IDs with explicitly provided IDs
        const tagDocIdSet = new Set(tagDocIds);
        documentIds = documentIds.filter((id) => tagDocIdSet.has(id));
      } else {
        documentIds = tagDocIds;
      }

      // If no documents match the filters, return empty answer
      if (documentIds.length === 0) {
        return reply.status(200).send({
          answer:
            "No documents matched the specified filters. Try broadening your search criteria.",
          sources: [],
          confidence: "low",
        });
      }
    }

    // Execute RAG pipeline
    const llmService = createLLMService();
    const ragQuery: Parameters<typeof executeRAGPipeline>[0] = {
      question: query,
      campaignId,
    };
    if (documentIds) {
      ragQuery.documentIds = documentIds;
    }
    if (documentTypes) {
      ragQuery.documentTypes = documentTypes;
    }
    if (conversationHistory && conversationHistory.length > 0) {
      ragQuery.conversationHistory = conversationHistory;
    }
    const result = await executeRAGPipeline(ragQuery, llmService);

    if (!result.ok) {
      request.log.error(
        { error: result.error },
        "RAG pipeline failed",
      );
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to process query",
      });
    }

    // Map numeric confidence to string label
    const confidenceLabel =
      result.value.confidence >= 0.7
        ? "high"
        : result.value.confidence >= 0.4
          ? "medium"
          : "low";

    if (isStripeConfigured()) {
      await recordUsage(userId, "ragQueries");
    }

    trackEvent(userId, "campaign_queried", {
      campaign_id: campaignId,
      confidence: confidenceLabel,
      chunks_retrieved: result.value.chunksRetrieved,
      chunks_used: result.value.chunksUsed,
      is_unanswerable: result.value.isUnanswerable,
      has_filters: !!filters,
    });

    return reply.status(200).send({
      answer: result.value.answer,
      sources: result.value.sources,
      confidence: confidenceLabel,
    });
  });

  // POST /api/campaigns/:campaignId/sessions/query - Query session transcripts
  app.post("/:campaignId/sessions/query", async (request, reply) => {
    // Validate campaign ID
    const paramResult = queryParamSchema.safeParse(request.params);
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

    // Verify user owns the campaign
    const campaign = await findCampaignByIdAndUserId(campaignId, userId);
    if (!campaign) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Campaign not found",
      });
    }

    if (isStripeConfigured()) {
      const limit = await checkUsageLimit(userId, "ragQueries");
      if (!limit.allowed) {
        return reply.status(402).send({
          statusCode: 402,
          error: "Payment Required",
          message: `RAG query limit reached (${limit.current}/${limit.limit}). Please upgrade your plan.`,
          feature: "ragQueries",
          current: limit.current,
          limit: limit.limit,
        });
      }
    }

    // Validate request body
    const bodyResult = sessionQueryBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          bodyResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const { query, dateRange, sessionIds, includeDocuments, conversationHistory } =
      bodyResult.data;

    // Resolve transcript document IDs matching the filters
    const transcriptDocIds = await findTranscriptDocumentIds(campaignId, {
      dateRange,
      sessionIds,
    });

    // Combine with non-transcript document IDs if requested
    let documentIds: string[];
    if (includeDocuments) {
      const regularDocIds = await findNonTranscriptDocumentIds(campaignId);
      documentIds = [...transcriptDocIds, ...regularDocIds];
    } else {
      documentIds = transcriptDocIds;
    }

    // If no documents match, return early
    if (documentIds.length === 0) {
      return reply.status(200).send({
        answer:
          "No session transcripts matched the specified filters. Try broadening your date range or removing session filters.",
        sources: [],
        confidence: "low",
      });
    }

    // Execute RAG pipeline
    const llmService = createLLMService();
    const ragQuery: Parameters<typeof executeRAGPipeline>[0] = {
      question: query,
      campaignId,
      documentIds,
    };
    if (conversationHistory && conversationHistory.length > 0) {
      ragQuery.conversationHistory = conversationHistory;
    }
    const result = await executeRAGPipeline(ragQuery, llmService);

    if (!result.ok) {
      request.log.error(
        { error: result.error },
        "Session query RAG pipeline failed",
      );
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to process query",
      });
    }

    // Map numeric confidence to string label
    const confidenceLabel =
      result.value.confidence >= 0.7
        ? "high"
        : result.value.confidence >= 0.4
          ? "medium"
          : "low";

    if (isStripeConfigured()) {
      await recordUsage(userId, "ragQueries");
    }

    trackEvent(userId, "session_history_queried", {
      campaign_id: campaignId,
      confidence: confidenceLabel,
      chunks_retrieved: result.value.chunksRetrieved,
      chunks_used: result.value.chunksUsed,
      is_unanswerable: result.value.isUnanswerable,
      has_date_range: !!dateRange,
      has_session_ids: !!sessionIds,
      include_documents: includeDocuments,
    });

    return reply.status(200).send({
      answer: result.value.answer,
      sources: result.value.sources,
      confidence: confidenceLabel,
    });
  });
}
