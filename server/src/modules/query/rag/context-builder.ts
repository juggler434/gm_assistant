// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Context Builder
 *
 * Transforms retrieved search results into a structured context window
 * suitable for LLM prompting. Handles token budget management, chunk
 * deduplication, and source citation formatting.
 */

import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";
import { stripSourceSentinels } from "./sanitize.js";
import type {
  SourceCitation,
  BuiltContext,
  ContextBuilderOptions,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default maximum token budget for the context window */
const DEFAULT_MAX_TOKENS = 3000;

/** Default minimum relevance score for inclusion (0 = rely on adaptive ratio only) */
const DEFAULT_MIN_RELEVANCE_SCORE = 0;

/**
 * Default adaptive score ratio — chunks scoring below this fraction of the
 * top result's score are dropped, even if they exceed the absolute minimum.
 */
const DEFAULT_ADAPTIVE_RATIO = 0.3;

/** Approximate characters per token (same heuristic used by the chunking service) */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Estimates token count from a string using the same char-based heuristic
 * as the chunking service (~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Formats a single chunk wrapped in a <source> tag. Everything inside the tag
 * is untrusted attacker-controlled data; the system prompt instructs the LLM
 * to treat tag contents as data, not instructions.
 */
function formatChunkEntry(citationIndex: number, result: HybridSearchResult): string {
  const headerParts: string[] = [];

  if (result.document.documentType === "transcript") {
    const metadata = result.document.metadata as Record<string, unknown>;
    const sessionTitle = (metadata?.sessionTitle as string) ?? result.document.name;
    headerParts.push(stripSourceSentinels(sessionTitle));
    if (result.chunk.section) {
      headerParts.push(`(${stripSourceSentinels(result.chunk.section)})`);
    }
    if (metadata?.sessionDate) {
      const date = new Date(metadata.sessionDate as string);
      if (!isNaN(date.getTime())) {
        headerParts.push(
          `[${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}]`,
        );
      }
    }
  } else {
    headerParts.push(stripSourceSentinels(result.document.name));
    if (result.chunk.section) {
      headerParts.push(`- ${stripSourceSentinels(result.chunk.section)}`);
    }
    if (result.chunk.pageNumber !== null) {
      headerParts.push(`(p. ${result.chunk.pageNumber})`);
    }
  }

  const header = headerParts.join(" ");
  const body = stripSourceSentinels(result.chunk.content);

  return `<source id="${citationIndex}">\n[${citationIndex}] ${header}\n${body}\n</source>`;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Build a context string from hybrid search results, respecting token limits.
 *
 * Chunks are included in relevance order (highest score first) until the
 * token budget is exhausted. Each chunk is tagged with a citation marker
 * that maps to the returned `sources` array.
 *
 * @param searchResults - Results from hybrid search, already sorted by score
 * @param options - Token budget and filtering options
 * @returns The assembled context with citation metadata
 */
export function buildContext(
  searchResults: HybridSearchResult[],
  options: ContextBuilderOptions = {},
): BuiltContext {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    minRelevanceScore = DEFAULT_MIN_RELEVANCE_SCORE,
    adaptiveRatio = DEFAULT_ADAPTIVE_RATIO,
  } = options;

  // Compute the effective minimum: the higher of the absolute threshold and
  // an adaptive floor derived from the top result's score.
  const topScore = searchResults.length > 0 ? searchResults[0]!.score : 0;
  const adaptiveFloor = topScore * adaptiveRatio;
  const effectiveMin = Math.max(minRelevanceScore, adaptiveFloor);

  const sources: SourceCitation[] = [];
  const contextParts: string[] = [];
  let totalTokens = 0;
  let citationIndex = 0;

  for (const result of searchResults) {
    // Skip chunks below the effective relevance threshold
    if (result.score < effectiveMin) {
      continue;
    }

    // Format the chunk entry to estimate its size
    const candidateIndex = citationIndex + 1;
    const entry = formatChunkEntry(candidateIndex, result);
    const entryTokens = estimateTokens(entry);

    // Check token budget (include separator overhead)
    const separatorTokens = contextParts.length > 0 ? estimateTokens("\n\n---\n\n") : 0;
    if (totalTokens + entryTokens + separatorTokens > maxTokens) {
      break;
    }

    citationIndex = candidateIndex;
    contextParts.push(entry);
    totalTokens += entryTokens + separatorTokens;

    const citation: SourceCitation = {
      index: citationIndex,
      documentName: result.document.name,
      documentId: result.document.id,
      documentType: result.document.documentType,
      pageNumber: result.chunk.pageNumber,
      section: result.chunk.section,
      relevanceScore: result.score,
    };

    // Add session metadata for transcript sources
    if (result.document.documentType === "transcript") {
      const metadata = result.document.metadata as Record<string, unknown>;
      if (metadata?.sessionId) citation.sessionId = metadata.sessionId as string;
      if (metadata?.sessionTitle) citation.sessionTitle = metadata.sessionTitle as string;
      if (metadata?.sessionDate) citation.sessionDate = metadata.sessionDate as string;
    }

    sources.push(citation);
  }

  const contextText = contextParts.join("\n\n");

  return {
    contextText,
    sources,
    chunksUsed: sources.length,
    estimatedTokens: estimateTokens(contextText),
  };
}
