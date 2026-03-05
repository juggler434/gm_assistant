// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * RAG Service
 *
 * Orchestrates the full Retrieval-Augmented Generation pipeline:
 * 1. Receive user query
 * 2. Generate query embedding
 * 3. Search for relevant chunks (hybrid search)
 * 4. Build context from chunks
 * 5. Generate prompt with context
 * 6. Call LLM for response
 * 7. Return answer with source citations and confidence score
 */

import { type Result, ok, err } from "@/types/index.js";
import type { LLMService } from "@/services/llm/service.js";
import { generateEmbedding, type EmbeddingError } from "@/services/llm/index.js";
import {
  searchChunksHybrid,
  type HybridSearchOptions,
} from "@/modules/knowledge/retrieval/hybrid-search.js";
import { expandNeighborChunks } from "@/modules/knowledge/retrieval/chunk-expansion.js";
import { buildContext, estimateTokens } from "./context-builder.js";
import { buildCampaignContentContext } from "@/modules/generation/campaign-content.js";
import { generateResponse } from "./response-generator.js";
import { rewriteQuery } from "./query-rewriter.js";
import { rerankChunks } from "./reranker.js";
import type {
  RAGQuery,
  RAGResult,
  RAGError,
  ContextBuilderOptions,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default number of chunks to retrieve */
const DEFAULT_MAX_CHUNKS = 20;

/** Default maximum context token budget */
const DEFAULT_MAX_CONTEXT_TOKENS = 16_000;

/** Max chunks to keep when reranker fails (limits noise in context) */
const RERANK_FALLBACK_LIMIT = 5;

// ============================================================================
// Embedding Helper
// ============================================================================

/** Map shared EmbeddingError to RAGError */
function mapEmbeddingError(e: EmbeddingError): RAGError {
  return { code: "EMBEDDING_FAILED", message: e.message, cause: e.cause };
}

/** Generate a query embedding, mapping errors to RAGError */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], RAGError>> {
  const result = await generateEmbedding(query);
  if (!result.ok) return err(mapEmbeddingError(result.error));
  return result;
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Execute the full RAG pipeline.
 *
 * @param query - The RAG query parameters
 * @param llmService - The LLM service instance for generation
 * @returns The complete RAG result with answer, sources, and confidence
 */
export async function executeRAGPipeline(
  query: RAGQuery,
  llmService: LLMService,
): Promise<Result<RAGResult, RAGError>> {
  const {
    question,
    campaignId,
    documentIds,
    documentTypes,
    maxChunks = DEFAULT_MAX_CHUNKS,
    maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
  } = query;

  // ---- Validate input ----
  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length === 0) {
    return err({
      code: "INVALID_QUERY",
      message: "Question must not be empty",
    });
  }

  // ---- Step 1: Rewrite query if conversation history is present ----
  const rewriteResult = await rewriteQuery(
    trimmedQuestion,
    query.conversationHistory,
    llmService,
  );
  // rewriteQuery always returns ok (falls back to original on failure)
  const searchQuery = rewriteResult.ok ? rewriteResult.value : trimmedQuestion;

  // ---- Step 2: Generate query embedding ----
  const embeddingResult = await generateQueryEmbedding(searchQuery);
  if (!embeddingResult.ok) {
    return err(embeddingResult.error);
  }

  // ---- Step 3: Hybrid search for relevant chunks ----
  const searchOptions: HybridSearchOptions = {
    limit: maxChunks,
  };
  if (documentIds) {
    searchOptions.documentIds = documentIds;
  }
  if (documentTypes) {
    searchOptions.documentTypes = documentTypes;
  }

  const searchResult = await searchChunksHybrid(
    searchQuery,
    embeddingResult.value,
    campaignId,
    searchOptions,
  );

  if (!searchResult.ok) {
    return err({
      code: "SEARCH_FAILED",
      message: `Hybrid search failed: ${searchResult.error.message}`,
      cause: searchResult.error,
    });
  }

  const searchResults = searchResult.value;
  const chunksRetrieved = searchResults.length;

  console.log(`[RAG] Using LLM: ${llmService.providerName} / ${llmService.model}`);
  console.log(`[RAG] Search returned ${chunksRetrieved} chunks for query: "${searchQuery}"`);
  if (searchResults.length > 0) {
    console.log(`[RAG] Top 3 search scores: ${searchResults.slice(0, 3).map((r) => r.score.toFixed(3)).join(", ")}`);
  }

  // ---- Step 3b: Re-rank chunks with LLM (before expansion for clean signals) ----
  const rerankResult = await rerankChunks(searchQuery, searchResults, llmService);
  let rankedResults: typeof searchResults;

  if (!rerankResult.ok) {
    // Reranker LLM call or parse failed — fall back to top N by RRF score
    // to limit noise (RRF scores are rank-based, not relevance-based)
    rankedResults = searchResults.slice(0, RERANK_FALLBACK_LIMIT);
    console.log(`[RAG] Reranker failed (${rerankResult.error.message}), falling back to top ${rankedResults.length} chunks`);
  } else if (rerankResult.value.length > 0) {
    // Reranker succeeded and found relevant chunks
    rankedResults = rerankResult.value;
    console.log(`[RAG] Reranker kept ${rankedResults.length} chunks (from ${chunksRetrieved})`);
  } else {
    // Reranker succeeded but filtered everything out — nothing is relevant
    rankedResults = [];
    console.log(`[RAG] Reranker filtered out all chunks — nothing relevant found`);
  }

  if (rankedResults.length > 0) {
    console.log(`[RAG] Top 3 scores: ${rankedResults.slice(0, 3).map((r) => r.score.toFixed(3)).join(", ")}`);
    for (const r of rankedResults.slice(0, 3)) {
      console.log(`[RAG]   - [${r.document.name}] ${r.chunk.content.slice(0, 120).replace(/\n/g, " ")}...`);
    }
  }

  // ---- Step 3c: Expand surviving chunks with neighbor context ----
  await expandNeighborChunks(rankedResults);

  // ---- Step 4: Build context from search results ----
  const contextOptions: ContextBuilderOptions = {
    maxTokens: maxContextTokens,
  };

  const context = buildContext(rankedResults, contextOptions);

  console.log(`[RAG] Context built: ${context.chunksUsed} chunks used, ~${context.estimatedTokens} tokens`);

  // ---- Step 4b: Fetch saved campaign content ----
  const campaignContent = await buildCampaignContentContext(campaignId, { maxTokens: 1500 });
  if (campaignContent.contentText) {
    const savedSection = `\n\n---\n\n[SAVED] Campaign Content\n${campaignContent.contentText}`;
    context.contextText += savedSection;
    context.estimatedTokens += estimateTokens(savedSection);
    console.log(`[RAG] Appended saved campaign content: ${campaignContent.counts.npcs} NPCs, ${campaignContent.counts.hooks} hooks, ${campaignContent.counts.locations} locations`);
  }

  // ---- Step 4c: Early return when no relevant context was found ----
  if (context.chunksUsed === 0 && !campaignContent.contentText) {
    return ok({
      answer:
        "I don't have enough information in your campaign documents to answer this question.",
      confidence: 0.1,
      sources: [],
      isUnanswerable: true,
      chunksRetrieved,
      chunksUsed: 0,
    });
  }

  // ---- Step 5: Generate response via LLM ----
  const responseResult = await generateResponse(
    trimmedQuestion,
    context,
    llmService,
    query.conversationHistory,
  );

  if (!responseResult.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: responseResult.error.message,
      cause: responseResult.error,
    });
  }

  const generated = responseResult.value;

  // ---- Step 6: Assemble final result ----
  return ok({
    answer: generated.answer,
    confidence: generated.confidence,
    sources: generated.sources,
    isUnanswerable: generated.isUnanswerable,
    chunksRetrieved,
    chunksUsed: context.chunksUsed,
    usage: generated.usage,
  });
}
