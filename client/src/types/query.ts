/**
 * Query and RAG pipeline types.
 * Matches server/src/modules/query/rag/types.ts and query route responses.
 */

import type { DocumentType } from "./entities.ts";

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

/** A source document referenced in a query answer */
export interface QuerySource {
  documentName: string;
  documentId: string;
  documentType: string;
  pageNumber: number | null;
  section: string | null;
  relevanceScore: number;
}

/** Response from POST /api/campaigns/:campaignId/query */
export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
  confidence: ConfidenceLevel;
}

// ============================================================================
// RAG Internal Types (for advanced usage)
// ============================================================================

/** Token usage statistics from LLM calls */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Full RAG pipeline result (superset of QueryResponse) */
export interface RAGResult {
  answer: string;
  confidence: number;
  sources: QuerySource[];
  isUnanswerable: boolean;
  chunksRetrieved: number;
  chunksUsed: number;
  usage?: TokenUsage;
}
