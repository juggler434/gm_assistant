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
  /** Combined weighted score (0 to 1, higher = more relevant) */
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
 * Normalizes an array of scores to the 0-1 range using min-max normalization.
 * If all scores are identical (or there's only one), returns 1.0 for all.
 */
export function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const min = Math.min(...scores);
  const max = Math.max(...scores);

  if (max === min) {
    return scores.map(() => 1.0);
  }

  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Search for chunks using a hybrid approach that combines vector similarity
 * and keyword full-text search for better retrieval quality.
 *
 * Algorithm:
 * 1. Run vector search (top 2x limit)
 * 2. Run keyword search (top 2x limit)
 * 3. Normalize scores from each search to 0-1 range
 * 4. Combine with weighted scoring (default: 70% vector, 30% keyword)
 * 5. Deduplicate by chunk ID and return top-k
 *
 * When one search returns no results, the other search's weight is
 * scaled to 1.0 so scores are not artificially reduced.
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

  // Normalize vector scores (using the .score field which is 1 - distance)
  const vectorScores = vectorResults.map((r) => r.score);
  const normalizedVectorScores = normalizeScores(vectorScores);

  // Normalize keyword scores (using the .rank field from ts_rank)
  const keywordScores = keywordResults.map((r) => r.rank);
  const normalizedKeywordScores = normalizeScores(keywordScores);

  // Build lookup maps by chunk ID
  const vectorMap = new Map<string, { result: VectorSearchResult; normalizedScore: number }>();
  vectorResults.forEach((r, i) => {
    vectorMap.set(r.chunk.id, { result: r, normalizedScore: normalizedVectorScores[i] ?? 0 });
  });

  const keywordMap = new Map<string, { result: KeywordSearchResult; normalizedScore: number }>();
  keywordResults.forEach((r, i) => {
    keywordMap.set(r.chunk.id, { result: r, normalizedScore: normalizedKeywordScores[i] ?? 0 });
  });

  // Collect all unique chunk IDs
  const allChunkIds = new Set<string>([
    ...vectorMap.keys(),
    ...keywordMap.keys(),
  ]);

  // Compute combined scores and build results
  const combined: HybridSearchResult[] = [];

  for (const chunkId of allChunkIds) {
    const vectorEntry = vectorMap.get(chunkId);
    const keywordEntry = keywordMap.get(chunkId);

    const vScore = vectorEntry?.normalizedScore ?? 0;
    const kScore = keywordEntry?.normalizedScore ?? 0;

    const combinedScore = normVectorWeight * vScore + normKeywordWeight * kScore;

    // Use chunk/document data from whichever search found it (prefer vector for richer data)
    const source = vectorEntry?.result ?? keywordEntry!.result;

    combined.push({
      chunk: { ...source.chunk },
      score: combinedScore,
      vectorScore: vectorEntry ? vectorEntry.normalizedScore : null,
      keywordScore: keywordEntry ? keywordEntry.normalizedScore : null,
      document: { ...source.document },
    });
  }

  // Sort by combined score descending, return top-k
  combined.sort((a, b) => b.score - a.score);

  return ok(combined.slice(0, limit));
}
