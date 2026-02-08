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
import { config } from "@/config/index.js";
import type { LLMService } from "@/services/llm/service.js";
import type { DocumentType } from "@/db/schema/index.js";
import {
  searchChunksHybrid,
  type HybridSearchOptions,
} from "@/modules/knowledge/retrieval/hybrid-search.js";
import {
  buildContext,
  type ContextBuilderOptions,
} from "./context-builder.js";
import { generateResponse } from "./response-generator.js";

// ============================================================================
// Types
// ============================================================================

/** Input for a RAG query */
export interface RAGQuery {
  /** The user's question */
  question: string;
  /** Campaign ID to scope the search */
  campaignId: string;
  /** Optional: filter by specific document IDs */
  documentIds?: string[];
  /** Optional: filter by document types */
  documentTypes?: DocumentType[];
  /** Maximum number of chunks to retrieve (default: 8) */
  maxChunks?: number;
  /** Maximum token budget for context (default: 3000) */
  maxContextTokens?: number;
}

/** Full result of a RAG pipeline execution */
export interface RAGResult {
  /** The generated answer text */
  answer: string;
  /** Confidence score for the answer (0-1) */
  confidence: number;
  /** Sources used to generate the answer */
  sources: Array<{
    documentName: string;
    documentId: string;
    documentType: string;
    pageNumber: number | null;
    section: string | null;
    relevanceScore: number;
  }>;
  /** Whether the question could not be answered from available content */
  isUnanswerable: boolean;
  /** Number of chunks retrieved from search */
  chunksRetrieved: number;
  /** Number of chunks used in the context after filtering */
  chunksUsed: number;
  /** Token usage from the LLM, if available */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
}

/** Error types for the RAG pipeline */
export interface RAGError {
  code:
    | "INVALID_QUERY"
    | "EMBEDDING_FAILED"
    | "SEARCH_FAILED"
    | "CONTEXT_BUILD_FAILED"
    | "GENERATION_FAILED";
  message: string;
  cause?: unknown;
}

/** Ollama embed API response */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

// ============================================================================
// Constants
// ============================================================================

/** Embedding model matching the 768-dimension chunks table */
const EMBEDDING_MODEL = "nomic-embed-text";

/** Timeout for embedding requests (ms) */
const EMBEDDING_TIMEOUT = 30_000;

/** Default number of chunks to retrieve */
const DEFAULT_MAX_CHUNKS = 8;

/** Default maximum context token budget */
const DEFAULT_MAX_CONTEXT_TOKENS = 3000;

// ============================================================================
// Embedding Helper
// ============================================================================

/**
 * Generate an embedding for a single query string using the Ollama embed API.
 */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], RAGError>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);

  try {
    const response = await fetch(`${config.llm.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [query],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return err({
        code: "EMBEDDING_FAILED",
        message: `Query embedding request failed (${response.status}): ${body}`,
      });
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    const embedding = data.embeddings[0];
    if (!embedding) {
      return err({
        code: "EMBEDDING_FAILED",
        message: "No embedding returned from API",
      });
    }

    return ok(embedding);
  } catch (error) {
    return err({
      code: "EMBEDDING_FAILED",
      message: error instanceof Error
        ? `Query embedding error: ${error.message}`
        : "Query embedding request failed",
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
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

  // ---- Step 1: Generate query embedding ----
  const embeddingResult = await generateQueryEmbedding(trimmedQuestion);
  if (!embeddingResult.ok) {
    return err(embeddingResult.error);
  }

  // ---- Step 2: Hybrid search for relevant chunks ----
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
    trimmedQuestion,
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

  // ---- Step 3: Build context from search results ----
  const contextOptions: ContextBuilderOptions = {
    maxTokens: maxContextTokens,
  };

  const context = buildContext(searchResults, contextOptions);

  // ---- Step 4: Generate response via LLM ----
  const responseResult = await generateResponse(
    trimmedQuestion,
    context,
    llmService,
  );

  if (!responseResult.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: responseResult.error.message,
      cause: responseResult.error,
    });
  }

  const generated = responseResult.value;

  // ---- Step 5: Assemble final result ----
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
