// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Response Generator
 *
 * Constructs the LLM prompt from retrieved context and the user query,
 * calls the LLM service, and parses the response into a structured
 * answer with confidence scoring and source citations.
 */

import { type Result, ok, err } from "@/types/index.js";
import type { LLMService } from "@/services/llm/service.js";
import type {
  BuiltContext,
  SourceCitation,
  AnswerSource,
  GeneratedAnswer,
  ResponseGeneratorError,
  ConversationMessage,
} from "./types.js";

// ============================================================================
// Prompt Construction
// ============================================================================

/**
 * System prompt that instructs the LLM how to behave as a RAG assistant
 * for a tabletop RPG game master.
 */
const SYSTEM_PROMPT = `You are a helpful assistant for a tabletop RPG game master. Answer questions based on the provided source text from their campaign documents.

Rules:
1. Base your answer on the provided source text. When the source text contains relevant information, answer clearly and specifically. Quote exact numbers, dice, DCs, ranges, durations, and mechanics verbatim — write "1d20" not "a die roll", write "DC 15" not "a moderate difficulty".
2. Do NOT add information from your own knowledge. Only state what the source text says.
3. Cite sources using their markers (e.g. [1], [2]).
4. If the source text does not address the question at all, begin with "I don't have enough information" and explain what's missing.
5. If sources conflict, note the discrepancy and cite both.`;

/**
 * Builds the user message that combines the context and question.
 */
function buildUserMessage(query: string, context: BuiltContext): string {
  if (context.chunksUsed === 0) {
    return `Question: ${query}\n\nNo relevant context was found in the campaign documents.`;
  }

  const sourceLegend = context.sources
    .map((s) => {
      const parts = [`[${s.index}] ${s.documentName}`];
      if (s.section) parts.push(`- ${s.section}`);
      if (s.pageNumber !== null) parts.push(`(p. ${s.pageNumber})`);
      return parts.join(" ");
    })
    .join("\n");

  return `SOURCE TEXT:\n\n${context.contextText}\n\nSOURCES:\n${sourceLegend}\n\nQUESTION: ${query}\n\nAnswer using the source text above. Quote exact values and game mechanics verbatim.`;
}

// ============================================================================
// Unanswerable Detection
// ============================================================================

/** Phrases that indicate the LLM could not answer from the provided context */
const UNANSWERABLE_PATTERNS = [
  "i don't have enough information",
  "i do not have enough information",
  "not mentioned in",
  "no information about",
  "not found in the",
  "cannot find",
  "no relevant context",
  "not mentioned in the provided",
  "cannot answer this question",
];

/**
 * Detects whether the answer indicates the question cannot be answered
 * from the available context.
 */
function detectUnanswerable(answerText: string): boolean {
  const lower = answerText.toLowerCase();
  return UNANSWERABLE_PATTERNS.some((p) => lower.includes(p));
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Computes a confidence score for the generated answer based on:
 * 1. The relevance scores of the sources used
 * 2. Whether the answer indicates it lacks information
 * 3. The number of supporting sources
 *
 * Returns a value between 0 and 1.
 */
export function computeConfidence(
  sources: SourceCitation[],
  answerText: string,
): number {
  // If no sources were available, confidence is very low
  if (sources.length === 0) {
    return 0.1;
  }

  if (detectUnanswerable(answerText)) {
    return 0.15;
  }

  // Base confidence from the top source's relevance score
  const topScore = sources[0]?.relevanceScore ?? 0;

  // Boost for having multiple supporting sources (up to +0.15)
  const sourceBoost = Math.min(sources.length - 1, 3) * 0.05;

  // Average relevance of all sources used (weighted at 30%)
  const avgRelevance = sources.reduce((sum, s) => sum + s.relevanceScore, 0) / sources.length;

  const confidence = topScore * 0.5 + avgRelevance * 0.3 + sourceBoost + 0.05;

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, confidence));
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate an answer using the LLM with the built context.
 *
 * @param query - The user's original question
 * @param context - The assembled context from the context builder
 * @param llmService - The LLM service instance to use for generation
 * @returns The generated answer with confidence and citations
 */
/** Maximum number of history messages to include in the prompt */
const MAX_HISTORY_MESSAGES = 10;

export async function generateResponse(
  query: string,
  context: BuiltContext,
  llmService: LLMService,
  conversationHistory?: ConversationMessage[],
): Promise<Result<GeneratedAnswer, ResponseGeneratorError>> {
  const userMessage = buildUserMessage(query, context);

  // Build messages array: system, then recent history, then current user message
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  const chatResult = await llmService.chat({
    messages,
    temperature: 0,
  });

  if (!chatResult.ok) {
    return err({
      code: "LLM_ERROR",
      message: `LLM generation failed: ${chatResult.error.message}`,
      cause: chatResult.error,
    });
  }

  const answerText = chatResult.value.message.content;
  const isUnanswerable = detectUnanswerable(answerText);
  const confidence = computeConfidence(context.sources, answerText);

  // Map context sources to answer sources
  const answerSources: AnswerSource[] = context.sources.map((s) => ({
    documentName: s.documentName,
    documentId: s.documentId,
    documentType: s.documentType,
    pageNumber: s.pageNumber,
    section: s.section,
    relevanceScore: s.relevanceScore,
  }));

  return ok({
    answer: answerText,
    confidence,
    sources: answerSources,
    isUnanswerable,
    usage: chatResult.value.usage,
  });
}
