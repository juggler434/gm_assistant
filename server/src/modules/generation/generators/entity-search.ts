// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Entity Search
 *
 * Dedicated keyword search for user-referenced entities (NPCs, factions, locations).
 * Runs a separate keyword-only search to find chunks mentioning specific entity names,
 * then merges those results with priority into the general hybrid search results.
 *
 * This prevents entity names from being diluted in large generic embedding queries,
 * ensuring the LLM has actual campaign context about referenced entities.
 */

import {
  searchChunksByKeyword,
  type KeywordSearchResult,
  type KeywordSearchOptions,
} from "@/modules/knowledge/retrieval/keyword-search.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";

// ============================================================================
// Types
// ============================================================================

export interface EntitySearchOptions {
  /** Maximum number of entity-specific chunks to retrieve (default: 4) */
  limit?: number;
  /** Filter by document types */
  documentTypes?: KeywordSearchOptions["documentTypes"];
}

// ============================================================================
// Entity Search
// ============================================================================

/**
 * Run a keyword search specifically for user-referenced entity names.
 *
 * Returns empty array for empty/whitespace-only input. Errors are caught
 * and returned as empty arrays for graceful degradation.
 */
export async function searchEntities(
  entityText: string,
  campaignId: string,
  options: EntitySearchOptions = {},
): Promise<KeywordSearchResult[]> {
  const trimmed = entityText.trim();
  if (!trimmed) return [];

  const { limit = 4, documentTypes } = options;

  const searchOptions: KeywordSearchOptions = { limit };
  if (documentTypes) searchOptions.documentTypes = documentTypes;

  const result = await searchChunksByKeyword(trimmed, campaignId, searchOptions);

  if (!result.ok) return [];

  return result.value;
}

// ============================================================================
// Result Merging
// ============================================================================

/**
 * Merge entity-specific keyword results into general hybrid search results.
 *
 * Entity results are converted to HybridSearchResult format with synthetic scores
 * set slightly above the top general result. This ensures they survive the
 * adaptive relevance filter in buildContext (which drops chunks below 30% of
 * the top score). Deduplicates by chunk ID, preferring entity results.
 *
 * Returns entity chunks first, then remaining general chunks.
 */
export function mergeEntityResults(
  entityResults: KeywordSearchResult[],
  generalResults: HybridSearchResult[],
): HybridSearchResult[] {
  if (entityResults.length === 0) return generalResults;

  // Find top general score to set entity scores above it
  const topGeneralScore = generalResults.length > 0
    ? Math.max(...generalResults.map((r) => r.score))
    : 0.5;

  // Convert entity results to hybrid format with boosted scores
  const entityChunkIds = new Set<string>();
  const convertedEntities: HybridSearchResult[] = entityResults.map((er, i) => {
    entityChunkIds.add(er.chunk.id);
    return {
      chunk: er.chunk,
      // Score slightly above top general result, decreasing for each entity result
      score: topGeneralScore + 0.1 - i * 0.01,
      vectorScore: null,
      keywordScore: er.rank,
      document: er.document,
    };
  });

  // Filter out general results that duplicate entity results
  const dedupedGeneral = generalResults.filter(
    (r) => !entityChunkIds.has(r.chunk.id),
  );

  return [...convertedEntities, ...dedupedGeneral];
}
