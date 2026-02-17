// SPDX-License-Identifier: AGPL-3.0-or-later

import { queryClient } from "@/db/index.js";
import { type Result, ok, err } from "@/types/index.js";
import {
  type DocumentType,
  type DocumentMetadata,
  EMBEDDING_DIMENSIONS,
} from "@/db/schema/index.js";

/**
 * Result from a vector similarity search
 */
export interface VectorSearchResult {
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
  /** Cosine distance (0 = identical, 2 = opposite) */
  distance: number;
  /** Similarity score (1 = identical, -1 = opposite) */
  score: number;
  /** Associated document metadata */
  document: {
    id: string;
    name: string;
    documentType: DocumentType;
    metadata: DocumentMetadata;
  };
}

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum similarity score threshold (optional) */
  minScore?: number;
  /** Filter by specific document IDs (optional) */
  documentIds?: string[];
  /** Filter by document types (optional) */
  documentTypes?: DocumentType[];
}

/**
 * Error types for vector search operations
 */
export interface VectorSearchError {
  code: "INVALID_EMBEDDING" | "DATABASE_ERROR" | "NO_RESULTS";
  message: string;
  cause?: unknown;
}

/**
 * Validates an embedding vector
 */
function validateEmbedding(embedding: number[]): VectorSearchError | null {
  if (!Array.isArray(embedding)) {
    return {
      code: "INVALID_EMBEDDING",
      message: "Embedding must be an array of numbers",
    };
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    return {
      code: "INVALID_EMBEDDING",
      message: `Embedding must have ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    };
  }

  if (!embedding.every((n) => typeof n === "number" && !isNaN(n))) {
    return {
      code: "INVALID_EMBEDDING",
      message: "Embedding must contain only valid numbers",
    };
  }

  return null;
}

/**
 * Converts cosine distance to similarity score
 * Cosine distance: 0 = identical, 2 = opposite
 * Similarity score: 1 = identical, -1 = opposite
 */
function distanceToScore(distance: number): number {
  return 1 - distance;
}

/**
 * Search for chunks by vector similarity within a campaign
 *
 * Uses pgvector's cosine distance operator (<=>) for similarity search.
 * Results are ordered by similarity (most similar first).
 *
 * @param embedding - The query embedding vector (768 dimensions)
 * @param campaignId - The campaign ID to scope the search
 * @param options - Search options (limit, filters, etc.)
 * @returns Array of search results with chunks, scores, and document metadata
 */
export async function searchChunksByVector(
  embedding: number[],
  campaignId: string,
  options: VectorSearchOptions = {}
): Promise<Result<VectorSearchResult[], VectorSearchError>> {
  const { limit = 10, minScore, documentIds, documentTypes } = options;

  // Validate embedding
  const validationError = validateEmbedding(embedding);
  if (validationError) {
    return err(validationError);
  }

  try {
    // Build the embedding vector string for pgvector
    const embeddingStr = `[${embedding.join(",")}]`;

    // Build WHERE conditions
    const conditions: string[] = ["c.campaign_id = $1"];
    const params: unknown[] = [campaignId];

    // Add document ID filter if provided
    if (documentIds && documentIds.length > 0) {
      const placeholders = documentIds.map(
        (_, i) => `$${params.length + i + 1}`
      );
      conditions.push(`c.document_id IN (${placeholders.join(", ")})`);
      params.push(...documentIds);
    }

    // Add document type filter if provided
    if (documentTypes && documentTypes.length > 0) {
      const placeholders = documentTypes.map(
        (_, i) => `$${params.length + i + 1}`
      );
      conditions.push(`d.document_type IN (${placeholders.join(", ")})`);
      params.push(...documentTypes);
    }

    // Add minimum score filter if provided (convert to max distance)
    // score = 1 - distance, so distance = 1 - score
    if (minScore !== undefined) {
      const maxDistance = 1 - minScore;
      conditions.push(`(c.embedding <=> '${embeddingStr}'::vector) <= $${params.length + 1}`);
      params.push(maxDistance);
    }

    const whereClause = conditions.join(" AND ");

    // Execute the vector similarity search query
    // Using raw SQL because Drizzle doesn't natively support pgvector operators
    const queryText = `
      SELECT
        c.id as chunk_id,
        c.content,
        c.chunk_index,
        c.token_count,
        c.page_number,
        c.section,
        c.created_at as chunk_created_at,
        c.embedding <=> '${embeddingStr}'::vector as distance,
        d.id as document_id,
        d.name as document_name,
        d.document_type,
        d.metadata
      FROM chunks c
      INNER JOIN documents d ON c.document_id = d.id
      WHERE ${whereClause}
      ORDER BY c.embedding <=> '${embeddingStr}'::vector ASC
      LIMIT ${limit}
    `;

    const rows = (await queryClient.unsafe(
      queryText,
      params as (string | number)[]
    )) as unknown as Array<{
      chunk_id: string;
      content: string;
      chunk_index: number;
      token_count: number;
      page_number: number | null;
      section: string | null;
      chunk_created_at: Date;
      distance: number;
      document_id: string;
      document_name: string;
      document_type: DocumentType;
      metadata: DocumentMetadata;
    }>;

    // Transform results to the expected format
    const results: VectorSearchResult[] = rows.map((row) => ({
      chunk: {
        id: row.chunk_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        tokenCount: row.token_count,
        pageNumber: row.page_number,
        section: row.section,
        createdAt: row.chunk_created_at,
      },
      distance: Number(row.distance),
      score: distanceToScore(Number(row.distance)),
      document: {
        id: row.document_id,
        name: row.document_name,
        documentType: row.document_type,
        metadata: row.metadata ?? {},
      },
    }));

    return ok(results);
  } catch (error) {
    return err({
      code: "DATABASE_ERROR",
      message: "Failed to execute vector search",
      cause: error,
    });
  }
}

/**
 * Search for the single most similar chunk
 *
 * Convenience function that returns only the top result.
 *
 * @param embedding - The query embedding vector
 * @param campaignId - The campaign ID to scope the search
 * @param options - Search options (filters only, limit is ignored)
 * @returns The most similar chunk with score and document metadata, or null
 */
export async function findMostSimilarChunk(
  embedding: number[],
  campaignId: string,
  options: Omit<VectorSearchOptions, "limit"> = {}
): Promise<Result<VectorSearchResult | null, VectorSearchError>> {
  const result = await searchChunksByVector(embedding, campaignId, {
    ...options,
    limit: 1,
  });

  if (!result.ok) {
    return result;
  }

  return ok(result.value[0] ?? null);
}

/**
 * Search for chunks with a minimum similarity threshold
 *
 * Returns all chunks above the specified similarity score,
 * up to the limit.
 *
 * @param embedding - The query embedding vector
 * @param campaignId - The campaign ID to scope the search
 * @param minScore - Minimum similarity score (0 to 1)
 * @param options - Additional search options
 * @returns Chunks with similarity score >= minScore
 */
export async function searchChunksAboveThreshold(
  embedding: number[],
  campaignId: string,
  minScore: number,
  options: Omit<VectorSearchOptions, "minScore"> = {}
): Promise<Result<VectorSearchResult[], VectorSearchError>> {
  return searchChunksByVector(embedding, campaignId, {
    ...options,
    minScore,
  });
}
