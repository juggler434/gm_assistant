// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * LLM Re-ranker
 *
 * After initial hybrid search retrieval, this module uses an LLM to score
 * each chunk's actual relevance to the question. This filters out chunks
 * that are topically similar but don't help answer the question.
 *
 * On failure (LLM error, parse error), returns the original chunks unchanged
 * so the pipeline degrades gracefully.
 */

import { type Result, ok } from "@/types/index.js";
import type { LLMService } from "@/services/llm/service.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";
import type { RAGError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Low temperature for consistent scoring */
const RERANK_TEMPERATURE = 0.1;

/** Max tokens for the JSON array response */
const RERANK_MAX_TOKENS = 2000;

/** Timeout for the rerank call (ms) */
const RERANK_TIMEOUT = 30_000;

/** Minimum normalized score to keep a chunk (0-1) */
const MIN_SCORE_THRESHOLD = 0.2;

/** Truncate chunk content in the prompt to this many characters */
const MAX_CHUNK_CHARS = 1500;

const RERANK_SYSTEM_PROMPT = `You are a relevance judge. Given a question and numbered text passages, rate each passage's relevance to answering the question on a scale of 1-10. Output ONLY a JSON array of objects: [{"index": 1, "score": 8}, ...]. Do not explain.`;

// ============================================================================
// Re-ranker
// ============================================================================

interface RerankScore {
  index: number;
  score: number;
}

/**
 * Re-rank chunks using an LLM to judge relevance to the question.
 *
 * Sends a single batched request with all chunks, parses the LLM's
 * relevance scores, and returns chunks sorted by score with low-scoring
 * ones filtered out.
 *
 * On any failure, returns the original chunks unchanged.
 */
export async function rerankChunks(
  question: string,
  chunks: HybridSearchResult[],
  llmService: LLMService,
): Promise<Result<HybridSearchResult[], RAGError>> {
  if (chunks.length === 0) {
    return ok([]);
  }

  // Build numbered passage list
  const passages = chunks
    .map((c, i) => `[${i + 1}] ${c.chunk.content.slice(0, MAX_CHUNK_CHARS)}`)
    .join("\n\n");

  const userMessage = `Question: ${question}\n\n${passages}`;

  const result = await llmService.chat({
    messages: [
      { role: "system", content: RERANK_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: RERANK_TEMPERATURE,
    maxTokens: RERANK_MAX_TOKENS,
    timeout: RERANK_TIMEOUT,
  });

  if (!result.ok) {
    // Non-fatal: fall back to original chunks
    return ok(chunks);
  }

  const responseText = result.value.message.content.trim();

  // Parse JSON scores from the response
  let scores: RerankScore[];
  try {
    scores = JSON.parse(responseText) as RerankScore[];
    if (!Array.isArray(scores)) {
      return ok(chunks);
    }
  } catch {
    // Non-fatal: fall back to original chunks
    return ok(chunks);
  }

  // Build a map of 1-based index → normalized score
  const scoreMap = new Map<number, number>();
  for (const entry of scores) {
    if (
      typeof entry.index === "number" &&
      typeof entry.score === "number" &&
      entry.index >= 1 &&
      entry.index <= chunks.length
    ) {
      // Normalize 1-10 scale to 0-1
      scoreMap.set(entry.index, entry.score / 10);
    }
  }

  // Apply scores and filter
  const reranked: HybridSearchResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const newScore = scoreMap.get(i + 1);
    const chunk = chunks[i];
    if (newScore !== undefined && newScore >= MIN_SCORE_THRESHOLD && chunk) {
      reranked.push({
        ...chunk,
        score: newScore,
      });
    }
  }

  // Sort by score descending
  reranked.sort((a, b) => b.score - a.score);

  return ok(reranked);
}
