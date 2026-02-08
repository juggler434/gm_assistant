/**
 * RAG Pipeline Types
 *
 * Shared type definitions for the context builder, response generator,
 * and RAG service modules.
 */

import type { DocumentType } from "@/db/schema/index.js";

// ============================================================================
// Context Builder Types
// ============================================================================

/** A citation reference for a single source used in the context */
export interface SourceCitation {
  /** Index used in the context (e.g. [1], [2]) */
  index: number;
  /** Document name */
  documentName: string;
  /** Document ID */
  documentId: string;
  /** Document type (e.g. "rulebook", "notes") */
  documentType: string;
  /** Page number, if available */
  pageNumber: number | null;
  /** Section heading, if available */
  section: string | null;
  /** Relevance score from hybrid search (0-1) */
  relevanceScore: number;
}

/** The assembled context ready to inject into a prompt */
export interface BuiltContext {
  /** The formatted context string for the LLM prompt */
  contextText: string;
  /** Ordered list of source citations referenced in the context */
  sources: SourceCitation[];
  /** Number of chunks included in the context */
  chunksUsed: number;
  /** Estimated token count of the context text */
  estimatedTokens: number;
}

/** Options for building context */
export interface ContextBuilderOptions {
  /** Maximum estimated tokens for the context window (default: 3000) */
  maxTokens?: number;
  /** Minimum relevance score to include a chunk (default: 0.1) */
  minRelevanceScore?: number;
}

// ============================================================================
// Response Generator Types
// ============================================================================

/** A formatted source reference in the final answer */
export interface AnswerSource {
  /** Document name */
  documentName: string;
  /** Document ID */
  documentId: string;
  /** Document type */
  documentType: string;
  /** Page number, if available */
  pageNumber: number | null;
  /** Section heading, if available */
  section: string | null;
  /** Relevance score (0-1) */
  relevanceScore: number;
}

/** The final generated answer */
export interface GeneratedAnswer {
  /** The answer text from the LLM */
  answer: string;
  /** Confidence score for the answer (0-1) */
  confidence: number;
  /** Sources referenced in the answer */
  sources: AnswerSource[];
  /** Whether the LLM indicated it could not find relevant information */
  isUnanswerable: boolean;
  /** Token usage from the LLM, if available */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
}

/** Error types for response generation */
export interface ResponseGeneratorError {
  code: "LLM_ERROR" | "EMPTY_CONTEXT" | "PARSE_ERROR";
  message: string;
  cause?: unknown;
}

// ============================================================================
// RAG Service Types
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
