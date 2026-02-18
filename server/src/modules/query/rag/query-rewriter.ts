// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Query Rewriter
 *
 * When the user asks a follow-up question that references earlier conversation
 * (e.g. "tell me more about that", "what are their weaknesses?"), the raw text
 * is too vague for embedding + keyword search. This module rewrites such
 * questions into standalone search queries using a fast LLM call.
 *
 * The rewritten query is used only for retrieval — the original question is
 * still passed to the response generator.
 */

import { type Result, ok } from "@/types/index.js";
import type { LLMService } from "@/services/llm/service.js";
import type { ConversationMessage, RAGError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const REWRITE_SYSTEM_PROMPT = `You are a search query rewriter. Given a conversation history and the user's latest message, rewrite the latest message into a standalone search query that captures the full intent without needing any prior context.

Rules:
- Output ONLY the rewritten query, nothing else
- Keep it concise — a short phrase or sentence suitable for search
- Preserve specific names, terms, and details from the conversation
- If the latest message is already a standalone question, return it unchanged`;

/** Low temperature for deterministic rewrites */
const REWRITE_TEMPERATURE = 0.1;

/** Low token limit — rewrites should be short */
const REWRITE_MAX_TOKENS = 200;

/** Timeout for the rewrite call (ms) */
const REWRITE_TIMEOUT = 15_000;

// ============================================================================
// Query Rewriter
// ============================================================================

/**
 * Rewrite a follow-up question into a standalone search query using
 * conversation history for context.
 *
 * Returns the original question unchanged when no history is provided.
 * Falls back to the original question if the LLM call fails.
 */
export async function rewriteQuery(
  question: string,
  conversationHistory: ConversationMessage[] | undefined,
  llmService: LLMService,
): Promise<Result<string, RAGError>> {
  // No history → nothing to rewrite
  if (!conversationHistory || conversationHistory.length === 0) {
    return ok(question);
  }

  // Build the chat messages: system prompt, conversation history, then the
  // latest user question with an instruction to rewrite it.
  const messages = [
    { role: "system" as const, content: REWRITE_SYSTEM_PROMPT },
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: `Rewrite this follow-up into a standalone search query:\n\n${question}`,
    },
  ];

  const result = await llmService.chat({
    messages,
    temperature: REWRITE_TEMPERATURE,
    maxTokens: REWRITE_MAX_TOKENS,
    timeout: REWRITE_TIMEOUT,
  });

  if (!result.ok) {
    // Non-fatal: fall back to the original question
    return ok(question);
  }

  const rewritten = result.value.message.content.trim();

  // If the LLM returned empty text, fall back
  if (rewritten.length === 0) {
    return ok(question);
  }

  return ok(rewritten);
}
