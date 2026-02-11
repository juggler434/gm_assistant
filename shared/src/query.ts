/**
 * Query and RAG pipeline types.
 * Matches server/src/modules/query/rag/types.ts and query route responses.
 */

import type { DocumentType } from "./entities.js";

// ============================================================================
// Token Usage
// ============================================================================

/** Token usage statistics from LLM calls */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// Source Citations
// ============================================================================

/** A source document referenced in an answer */
export interface AnswerSource {
  documentName: string;
  documentId: string;
  documentType: string;
  pageNumber: number | null;
  section: string | null;
  relevanceScore: number;
}

/** Alias for AnswerSource — used in query response contexts */
export type QuerySource = AnswerSource;

// ============================================================================
// Query Request
// ============================================================================

/** Filters that can be applied to a query */
export interface QueryFilters {
  documentTypes?: DocumentType[];
  tags?: string[];
  documentIds?: string[];
}

/** Request body for POST /api/campaigns/:campaignId/query */
export interface QueryRequest {
  query: string;
  filters?: QueryFilters;
}

// ============================================================================
// Query Response
// ============================================================================

/** Confidence level for a query answer */
export type ConfidenceLevel = "high" | "medium" | "low";

/** Response from POST /api/campaigns/:campaignId/query */
export interface QueryResponse {
  answer: string;
  sources: AnswerSource[];
  confidence: ConfidenceLevel;
}

// ============================================================================
// RAG Result (full pipeline output)
// ============================================================================

/** Full RAG pipeline result (superset of QueryResponse) */
export interface RAGResult {
  answer: string;
  confidence: number;
  sources: AnswerSource[];
  isUnanswerable: boolean;
  chunksRetrieved: number;
  chunksUsed: number;
  usage?: TokenUsage;
}
