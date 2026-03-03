// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared Embedding Utility
 *
 * Centralizes all Ollama embedding API calls using nomic-embed-text,
 * which has an 8192-token context window — large enough to embed any
 * chunk without truncation.
 */

import { config } from "@/config/index.js";
import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";

// ============================================================================
// Types
// ============================================================================

/** Ollama embed API response */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

/** Error returned by embedding functions */
export interface EmbeddingError {
  code: "EMBEDDING_FAILED" | "CANCELLED";
  message: string;
  cause?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** Embedding model matching the 768-dimension chunks table */
export const EMBEDDING_MODEL = "nomic-embed-text";

/** Embedding vector dimensions */
export const EMBEDDING_DIMENSIONS = 768;

/** Maximum number of texts to embed in a single API call */
export const EMBEDDING_BATCH_SIZE = 20;

/** Timeout for batch embedding requests (ms) — longer for document indexing */
const BATCH_EMBEDDING_TIMEOUT = 120_000;

/** Timeout for single embedding requests (ms) */
const SINGLE_EMBEDDING_TIMEOUT = 30_000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate embeddings for a batch of texts using the Ollama embed API.
 *
 * Used by the document indexing pipeline for processing multiple chunks.
 *
 * @param texts - Array of text strings to embed
 * @param signal - Optional AbortSignal for cancellation
 */
export async function generateEmbeddings(
  texts: string[],
  signal?: AbortSignal,
): Promise<Result<number[][], EmbeddingError>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BATCH_EMBEDDING_TIMEOUT);

  // Abort on both timeout and external signal
  const onAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const response = await fetch(`${config.llm.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        truncate: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return err({
        code: "EMBEDDING_FAILED",
        message: `Embedding request failed (${response.status}): ${body}`,
      });
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    return ok(data.embeddings);
  } catch (error) {
    if (signal?.aborted) {
      return err({ code: "CANCELLED", message: "Job cancelled" });
    }
    return err({
      code: "EMBEDDING_FAILED",
      message: error instanceof Error
        ? `Embedding request error: ${error.message}`
        : "Embedding request failed",
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Generate an embedding for a single text string.
 *
 * Convenience wrapper around generateEmbeddings for single-text use cases
 * (RAG queries, generator context lookups).
 *
 * @param text - The text to embed
 */
export async function generateEmbedding(
  text: string,
): Promise<Result<number[], EmbeddingError>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SINGLE_EMBEDDING_TIMEOUT);

  try {
    const response = await fetch(`${config.llm.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text],
        truncate: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return err({
        code: "EMBEDDING_FAILED",
        message: `Embedding request failed (${response.status}): ${body}`,
      });
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    const embedding = data.embeddings[0];
    if (!embedding) {
      return err({
        code: "EMBEDDING_FAILED",
        message: "No embedding returned from API",
      });
    }

    return ok(embedding);
  } catch (error) {
    return err({
      code: "EMBEDDING_FAILED",
      message: error instanceof Error
        ? `Embedding error: ${error.message}`
        : "Embedding request failed",
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
