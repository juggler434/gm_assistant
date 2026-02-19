// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Result, ok, err } from "@/types/index.js";
import { type DocumentType } from "@/db/schema/index.js";
import {
  searchChunksByVector,
  type VectorSearchResult,
} from "./vector-search.js";
import {
  searchChunksByKeyword,
  type KeywordSearchResult,
} from "./keyword-search.js";

/**
 * Result from a hybrid search combining vector and keyword results
 */
export interface HybridSearchResult {
  /** The matching chunk */
  chunk: {
    id: string;
    content: string;
    chunkIndex: number;
    tokenCount: number;
    pageNumber: number | null;
    section: string | null;
    createdAt: Date;
  };
  /** Combined weighted RRF score (higher = more relevant) */
  score: number;
  /** Normalized vector similarity score (0 to 1), or null if not found by vector search */
  vectorScore: number | null;
  /** Normalized keyword relevance score (0 to 1), or null if not found by keyword search */
  keywordScore: number | null;
  /** Associated document metadata */
  document: {
    id: string;
    name: string;
    documentType: DocumentType;
    metadata: Record<string, unknown>;
  };
}

/**
 * Options for hybrid search
 */
export interface HybridSearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Weight for vector search scores (default: 0.7) */
  vectorWeight?: number;
  /** Weight for keyword search scores (default: 0.3) */
  keywordWeight?: number;
  /** Filter by specific document IDs (optional) */
  documentIds?: string[];
  /** Filter by document types (optional) */
  documentTypes?: DocumentType[];
  /** PostgreSQL text search configuration for keyword search (default: 'english') */
  language?: string;
}

/**
 * Error types for hybrid search operations
 */
export interface HybridSearchError {
  code: "INVALID_QUERY" | "INVALID_EMBEDDING" | "DATABASE_ERROR" | "INVALID_OPTIONS";
  message: string;
  cause?: unknown;
}

/**
 * Smoothing constant for Reciprocal Rank Fusion. Standard value from the
 * original RRF paper (Cormack et al., 2009). Higher values reduce the
 * influence of rank position, making scores more uniform.
 */
const RRF_K = 60;

/**
 * Compute the Reciprocal Rank Fusion score for a given rank position.
 * @param rank - 1-indexed rank position (1 = best)
 * @param k - Smoothing constant (default: 60)
 */
export function rrfScore(rank: number, k: number = RRF_K): number {
  return 1 / (k + rank);
}

/**
 * Search for chunks using a hybrid approach that combines vector similarity
 * and keyword full-text search for better retrieval quality.
 *
 * Algorithm:
 * 1. Run vector search (top 2x limit)
 * 2. Run keyword search (top 2x limit)
 * 3. Assign Reciprocal Rank Fusion (RRF) scores based on rank position
 * 4. Combine with weighted scoring (default: 70% vector, 30% keyword)
 * 5. Deduplicate by chunk ID and return top-k
 *
 * RRF is more robust than min-max normalization because it scores by
 * rank position rather than raw score, preventing inflated scores when
 * one search returns only loosely relevant results.
 *
 * @param query - The keyword search query string
 * @param embedding - The query embedding vector (768 dimensions)
 * @param campaignId - The campaign ID to scope the search
 * @param options - Search options (limit, weights, filters, etc.)
 * @returns Array of search results with combined scores and document metadata
 */
export async function searchChunksHybrid(
  query: string,
  embedding: number[],
  campaignId: string,
  options: HybridSearchOptions = {}
): Promise<Result<HybridSearchResult[], HybridSearchError>> {
  const {
    limit = 10,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    documentIds,
    documentTypes,
    language,
  } = options;

  // Validate weights
  if (vectorWeight < 0 || keywordWeight < 0) {
    return err({
      code: "INVALID_OPTIONS",
      message: "Weights must be non-negative",
    });
  }

  if (vectorWeight + keywordWeight === 0) {
    return err({
      code: "INVALID_OPTIONS",
      message: "At least one weight must be greater than zero",
    });
  }

  // Fetch 2x limit from each search to have enough candidates for merging
  const fetchLimit = limit * 2;

  // Build filter options, only including defined properties
  // (exactOptionalPropertyTypes disallows passing undefined for optional fields)
  const vectorOptions: { limit: number; documentIds?: string[]; documentTypes?: DocumentType[] } = {
    limit: fetchLimit,
  };
  const keywordOptions: { limit: number; documentIds?: string[]; documentTypes?: DocumentType[]; language?: string } = {
    limit: fetchLimit,
  };

  if (documentIds) {
    vectorOptions.documentIds = documentIds;
    keywordOptions.documentIds = documentIds;
  }
  if (documentTypes) {
    vectorOptions.documentTypes = documentTypes;
    keywordOptions.documentTypes = documentTypes;
  }
  if (language) {
    keywordOptions.language = language;
  }

  // Run both searches in parallel
  const [vectorResult, keywordResult] = await Promise.all([
    searchChunksByVector(embedding, campaignId, vectorOptions),
    searchChunksByKeyword(query, campaignId, keywordOptions),
  ]);

  // If both searches failed, return the first error
  if (!vectorResult.ok && !keywordResult.ok) {
    return err({
      code: "DATABASE_ERROR",
      message: "Both vector and keyword searches failed",
      cause: { vectorError: vectorResult.error, keywordError: keywordResult.error },
    });
  }

  const vectorResults: VectorSearchResult[] = vectorResult.ok ? vectorResult.value : [];
  const keywordResults: KeywordSearchResult[] = keywordResult.ok ? keywordResult.value : [];

  // Determine effective weights: if one search returned nothing, give all weight to the other
  const hasVectorResults = vectorResults.length > 0;
  const hasKeywordResults = keywordResults.length > 0;

  let effectiveVectorWeight: number;
  let effectiveKeywordWeight: number;

  if (hasVectorResults && hasKeywordResults) {
    effectiveVectorWeight = vectorWeight;
    effectiveKeywordWeight = keywordWeight;
  } else if (hasVectorResults) {
    effectiveVectorWeight = 1.0;
    effectiveKeywordWeight = 0;
  } else if (hasKeywordResults) {
    effectiveVectorWeight = 0;
    effectiveKeywordWeight = 1.0;
  } else {
    // Both returned empty results
    return ok([]);
  }

  // Normalize the total weight to sum to 1
  const totalWeight = effectiveVectorWeight + effectiveKeywordWeight;
  const normVectorWeight = effectiveVectorWeight / totalWeight;
  const normKeywordWeight = effectiveKeywordWeight / totalWeight;

  // Build RRF lookup maps by chunk ID (1-indexed rank position)
  const vectorMap = new Map<string, { result: VectorSearchResult; rrfScore: number }>();
  vectorResults.forEach((r, i) => {
    vectorMap.set(r.chunk.id, { result: r, rrfScore: rrfScore(i + 1) });
  });

  const keywordMap = new Map<string, { result: KeywordSearchResult; rrfScore: number }>();
  keywordResults.forEach((r, i) => {
    keywordMap.set(r.chunk.id, { result: r, rrfScore: rrfScore(i + 1) });
  });

  // Collect all unique chunk IDs
  const allChunkIds = new Set<string>([
    ...vectorMap.keys(),
    ...keywordMap.keys(),
  ]);

  // Compute weighted RRF scores
  const combined: HybridSearchResult[] = [];

  for (const chunkId of allChunkIds) {
    const vectorEntry = vectorMap.get(chunkId);
    const keywordEntry = keywordMap.get(chunkId);

    const vScore = vectorEntry?.rrfScore ?? 0;
    const kScore = keywordEntry?.rrfScore ?? 0;

    const combinedScore = normVectorWeight * vScore + normKeywordWeight * kScore;

    // Use chunk/document data from whichever search found it (prefer vector for richer data)
    const source = vectorEntry?.result ?? keywordEntry!.result;

    combined.push({
      chunk: { ...source.chunk },
      score: combinedScore,
      vectorScore: vectorEntry ? vectorEntry.rrfScore : null,
      keywordScore: keywordEntry ? keywordEntry.rrfScore : null,
      document: { ...source.document },
    });
  }

  // Sort by combined score descending
  combined.sort((a, b) => b.score - a.score);

  return ok(combined.slice(0, limit));
}
