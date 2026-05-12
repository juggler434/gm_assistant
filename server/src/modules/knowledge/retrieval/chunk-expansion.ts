// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Chunk Expansion
 *
 * After retrieval, fetches the immediate neighbor chunks (by chunkIndex ± 1
 * within the same document) for each top-scoring result. The neighbor content
 * is merged into the search result so the LLM sees more complete context
 * around each match.
 */

import { queryClient } from "@/db/index.js";
import type { HybridSearchResult } from "./hybrid-search.js";

/**
 * Neighbor chunk row returned from the database query.
 */
interface NeighborRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  page_number: number | null;
  end_page_number: number | null;
}

/** Information about a neighbor needed to merge content and widen page range. */
interface NeighborInfo {
  content: string;
  pageNumber: number | null;
  endPageNumber: number | null;
}

/**
 * Expand each search result by prepending/appending content from adjacent
 * chunks in the same document. Chunks already present in the result set are
 * skipped to avoid duplication. The merged content replaces the original
 * chunk content on each result.
 *
 * @param results - Hybrid search results (mutated in place)
 * @returns The same array with expanded chunk content
 */
export async function expandNeighborChunks(
  results: HybridSearchResult[],
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  // Collect the (documentId, chunkIndex ± 1) pairs we need to fetch
  const existingChunkIds = new Set(results.map((r) => r.chunk.id));

  // Build a set of neighbor keys to fetch: "docId:chunkIndex"
  const neighborKeys = new Set<string>();
  for (const r of results) {
    const docId = r.document.id;
    const idx = r.chunk.chunkIndex;
    if (idx > 0) neighborKeys.add(`${docId}:${idx - 1}`);
    neighborKeys.add(`${docId}:${idx + 1}`);
  }

  if (neighborKeys.size === 0) return results;

  // Build a single query to fetch all neighbor chunks at once.
  // We use (document_id, chunk_index) pairs as the filter.
  const docIndexPairs = [...neighborKeys].map((key) => {
    const [docId, idx] = key.split(":");
    return { docId: docId!, chunkIndex: Number(idx) };
  });

  // Build parameterized query: WHERE (document_id, chunk_index) IN (values...)
  const params: (string | number)[] = [];
  const valueClauses: string[] = [];
  for (const pair of docIndexPairs) {
    const docParam = params.length + 1;
    const idxParam = params.length + 2;
    valueClauses.push(`($${docParam}, $${idxParam})`);
    params.push(pair.docId, pair.chunkIndex);
  }

  const queryText = `
    SELECT id, document_id, chunk_index, content, token_count, page_number, end_page_number
    FROM chunks
    WHERE (document_id, chunk_index) IN (${valueClauses.join(", ")})
  `;

  let neighborRows: NeighborRow[];
  try {
    neighborRows = (await queryClient.unsafe(
      queryText,
      params,
    )) as unknown as NeighborRow[];
  } catch {
    // If expansion fails, return results unchanged rather than breaking the pipeline
    return results;
  }

  // Build a lookup: "docId:chunkIndex" -> neighbor info
  const neighborMap = new Map<string, NeighborInfo>();
  for (const row of neighborRows) {
    // Skip if this chunk is already one of the retrieved results
    if (existingChunkIds.has(row.id)) continue;
    neighborMap.set(`${row.document_id}:${row.chunk_index}`, {
      content: row.content,
      pageNumber: row.page_number,
      endPageNumber: row.end_page_number,
    });
  }

  // Merge neighbor content into each result and widen the chunk's page range
  // to cover the neighbors. Without this, citations would still report only
  // the matched chunk's page even though the LLM saw content from adjacent pages.
  for (const r of results) {
    const docId = r.document.id;
    const idx = r.chunk.chunkIndex;

    const prev = neighborMap.get(`${docId}:${idx - 1}`);
    const next = neighborMap.get(`${docId}:${idx + 1}`);

    if (prev || next) {
      const parts: string[] = [];
      if (prev) parts.push(prev.content);
      parts.push(r.chunk.content);
      if (next) parts.push(next.content);
      r.chunk.content = parts.join("\n\n");

      // The widened range covers prev's start through next's end, falling back
      // to the existing chunk's range when a neighbor's pageNumber is null
      // (e.g. legacy chunks indexed before endPageNumber existed).
      const startCandidates: number[] = [];
      if (prev?.pageNumber != null) startCandidates.push(prev.pageNumber);
      if (r.chunk.pageNumber != null) startCandidates.push(r.chunk.pageNumber);

      const endCandidates: number[] = [];
      const currentEnd = r.chunk.endPageNumber ?? r.chunk.pageNumber;
      if (currentEnd != null) endCandidates.push(currentEnd);
      const nextEnd = next ? (next.endPageNumber ?? next.pageNumber) : null;
      if (nextEnd != null) endCandidates.push(nextEnd);

      if (startCandidates.length > 0) {
        r.chunk.pageNumber = Math.min(...startCandidates);
      }
      if (endCandidates.length > 0) {
        r.chunk.endPageNumber = Math.max(...endCandidates);
      }
    }
  }

  return results;
}
