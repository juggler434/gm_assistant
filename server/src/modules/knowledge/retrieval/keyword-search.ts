// SPDX-License-Identifier: AGPL-3.0-or-later

import { queryClient } from "@/db/index.js";
import { type Result, ok, err } from "@/types/index.js";
import {
  type DocumentType,
  type DocumentMetadata,
} from "@/db/schema/index.js";

/**
 * Result from a keyword search
 */
export interface KeywordSearchResult {
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
  /** Full-text search relevance rank from ts_rank (higher = more relevant) */
  rank: number;
  /** Associated document metadata */
  document: {
    id: string;
    name: string;
    documentType: DocumentType;
    metadata: DocumentMetadata;
  };
}

/**
 * Options for keyword search
 */
export interface KeywordSearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Filter by specific document IDs (optional) */
  documentIds?: string[];
  /** Filter by document types (optional) */
  documentTypes?: DocumentType[];
  /** PostgreSQL text search configuration (default: 'english') */
  language?: string;
}

/**
 * Error types for keyword search operations
 */
export interface KeywordSearchError {
  code: "INVALID_QUERY" | "DATABASE_ERROR" | "NO_RESULTS";
  message: string;
  cause?: unknown;
}

/**
 * Validates a keyword search query string
 */
function validateQuery(query: string): KeywordSearchError | null {
  if (typeof query !== "string") {
    return {
      code: "INVALID_QUERY",
      message: "Search query must be a string",
    };
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return {
      code: "INVALID_QUERY",
      message: "Search query must not be empty",
    };
  }

  return null;
}

/**
 * Build an OR-based tsquery from a natural language query.
 *
 * Splits the query into words (filtering out very short ones), wraps each in
 * `plainto_tsquery` for proper stemming, then joins with `||` (OR). This
 * dramatically improves recall for natural language questions compared to
 * the default AND logic of a single `plainto_tsquery`.
 *
 * Returns the SQL expression string and the parameter values to append.
 * Falls back to a single `plainto_tsquery` when no words pass the filter.
 */
function buildOrTsquery(
  query: string,
  languageParamIndex: number,
  nextParamIndex: number
): { sql: string; params: string[] } {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    // Fallback: use the full query as-is (single plainto_tsquery)
    return {
      sql: `plainto_tsquery($${languageParamIndex}::regconfig, $${nextParamIndex})`,
      params: [query.trim()],
    };
  }

  const parts: string[] = [];
  const params: string[] = [];

  for (const word of words) {
    parts.push(
      `plainto_tsquery($${languageParamIndex}::regconfig, $${nextParamIndex + params.length})`
    );
    params.push(word);
  }

  return {
    sql: `(${parts.join(" || ")})`,
    params,
  };
}

/**
 * Search for chunks by keyword using PostgreSQL full-text search
 *
 * Uses `to_tsvector` and `plainto_tsquery` for full-text matching,
 * with `ts_rank` for relevance scoring. Results are ordered by
 * relevance (highest rank first).
 *
 * @param query - The keyword search query string
 * @param campaignId - The campaign ID to scope the search
 * @param options - Search options (limit, filters, language, etc.)
 * @returns Array of search results with chunks, ranks, and document metadata
 */
export async function searchChunksByKeyword(
  query: string,
  campaignId: string,
  options: KeywordSearchOptions = {}
): Promise<Result<KeywordSearchResult[], KeywordSearchError>> {
  const {
    limit = 10,
    documentIds,
    documentTypes,
    language = "english",
  } = options;

  // Validate query
  const validationError = validateQuery(query);
  if (validationError) {
    return err(validationError);
  }

  try {
    // Build the OR-based tsquery
    // $1 = campaignId, $2 = language config, $3+ = individual query words
    const params: unknown[] = [campaignId, language];
    const tsquery = buildOrTsquery(query, 2, params.length + 1);
    params.push(...tsquery.params);

    const conditions: string[] = [
      "c.campaign_id = $1",
      `to_tsvector($2::regconfig, c.content) @@ ${tsquery.sql}`,
    ];

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

    const whereClause = conditions.join(" AND ");

    // Execute the full-text search query
    // Using raw SQL because Drizzle doesn't natively support PostgreSQL full-text search
    const queryText = `
      SELECT
        c.id as chunk_id,
        c.content,
        c.chunk_index,
        c.token_count,
        c.page_number,
        c.section,
        c.created_at as chunk_created_at,
        ts_rank(to_tsvector($2::regconfig, c.content), ${tsquery.sql}) as rank,
        d.id as document_id,
        d.name as document_name,
        d.document_type,
        d.metadata
      FROM chunks c
      INNER JOIN documents d ON c.document_id = d.id
      WHERE ${whereClause}
      ORDER BY rank DESC
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
      rank: number;
      document_id: string;
      document_name: string;
      document_type: DocumentType;
      metadata: DocumentMetadata;
    }>;

    // Transform results to the expected format
    const results: KeywordSearchResult[] = rows.map((row) => ({
      chunk: {
        id: row.chunk_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        tokenCount: row.token_count,
        pageNumber: row.page_number,
        section: row.section,
        createdAt: row.chunk_created_at,
      },
      rank: Number(row.rank),
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
      message: "Failed to execute keyword search",
      cause: error,
    });
  }
}

/**
 * Search for the single most relevant chunk by keyword
 *
 * Convenience function that returns only the top result.
 *
 * @param query - The keyword search query string
 * @param campaignId - The campaign ID to scope the search
 * @param options - Search options (filters only, limit is ignored)
 * @returns The most relevant chunk with rank and document metadata, or null
 */
export async function findMostRelevantChunk(
  query: string,
  campaignId: string,
  options: Omit<KeywordSearchOptions, "limit"> = {}
): Promise<Result<KeywordSearchResult | null, KeywordSearchError>> {
  const result = await searchChunksByKeyword(query, campaignId, {
    ...options,
    limit: 1,
  });

  if (!result.ok) {
    return result;
  }

  return ok(result.value[0] ?? null);
}
