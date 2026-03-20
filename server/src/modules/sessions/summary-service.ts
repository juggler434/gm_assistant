// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Session Summary Generation Service
 *
 * Generates structured summaries from session transcripts using the LLM service.
 * For long transcripts, processes in chunks and combines into a final summary.
 */

import { createLLMService } from "@/services/llm/index.js";

/** The structured output from summary generation */
export interface GeneratedSummary {
  content: string;
  keyEvents: string[];
  npcsEncountered: string[];
  locationsVisited: string[];
  itemsAcquired: string[];
  openQuestions: string[];
}

// Approximate characters per token for English text
const CHARS_PER_TOKEN = 4;
// Max transcript tokens to fit in a single LLM call (leave room for prompt + output)
const MAX_SINGLE_PASS_CHARS = 12_000 * CHARS_PER_TOKEN;
// Chunk size for splitting long transcripts
const CHUNK_SIZE_CHARS = 8_000 * CHARS_PER_TOKEN;
// Overlap between chunks to maintain context
const CHUNK_OVERLAP_CHARS = 500 * CHARS_PER_TOKEN;

const SUMMARY_SYSTEM_PROMPT = `You are an expert RPG Game Master assistant that creates structured session summaries from game session transcripts.

Analyze the transcript and produce a JSON object with these fields:
- "content": A 2-4 paragraph narrative summary of the session (what happened, key moments, overall arc)
- "keyEvents": Array of strings describing key events and decisions made during the session
- "npcsEncountered": Array of NPC names encountered or mentioned during the session
- "locationsVisited": Array of location names visited or mentioned during the session
- "itemsAcquired": Array of items gained, lost, or used during the session
- "openQuestions": Array of unresolved plot hooks, mysteries, or open questions from the session

Guidelines:
- Be concise but capture the important details
- Focus on what matters for campaign continuity
- Use the characters' names when available
- List concrete, specific items rather than vague descriptions
- For open questions, highlight things the players seemed interested in or left unresolved

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`;

const CHUNK_SUMMARY_SYSTEM_PROMPT = `You are an expert RPG Game Master assistant. Summarize this portion of a game session transcript.

Produce a JSON object with these fields:
- "content": A 1-2 paragraph summary of what happened in this portion
- "keyEvents": Array of key events and decisions
- "npcsEncountered": Array of NPC names
- "locationsVisited": Array of location names
- "itemsAcquired": Array of items gained, lost, or used
- "openQuestions": Array of unresolved questions or hooks

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`;

const COMBINE_SYSTEM_PROMPT = `You are an expert RPG Game Master assistant. You are given multiple partial summaries from different portions of a single game session.

Combine them into one coherent final summary as a JSON object with these fields:
- "content": A 2-4 paragraph narrative summary covering the entire session (deduplicate, maintain chronological flow)
- "keyEvents": Combined and deduplicated array of key events and decisions
- "npcsEncountered": Combined and deduplicated array of NPC names
- "locationsVisited": Combined and deduplicated array of location names
- "itemsAcquired": Combined and deduplicated array of items
- "openQuestions": Combined and deduplicated array of open questions (remove any that were resolved later in the session)

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`;

/**
 * Parse a JSON response from the LLM, handling potential markdown fences.
 */
function parseLLMJson(text: string): GeneratedSummary {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned);

  return {
    content: typeof parsed.content === "string" ? parsed.content : "",
    keyEvents: Array.isArray(parsed.keyEvents)
      ? parsed.keyEvents.filter((s: unknown) => typeof s === "string")
      : [],
    npcsEncountered: Array.isArray(parsed.npcsEncountered)
      ? parsed.npcsEncountered.filter((s: unknown) => typeof s === "string")
      : [],
    locationsVisited: Array.isArray(parsed.locationsVisited)
      ? parsed.locationsVisited.filter((s: unknown) => typeof s === "string")
      : [],
    itemsAcquired: Array.isArray(parsed.itemsAcquired)
      ? parsed.itemsAcquired.filter((s: unknown) => typeof s === "string")
      : [],
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter((s: unknown) => typeof s === "string")
      : [],
  };
}

/**
 * Split text into overlapping chunks.
 */
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
  }

  return chunks;
}

/**
 * Generate a summary from a session transcript.
 *
 * For short transcripts, uses a single LLM call.
 * For long transcripts, splits into chunks, summarizes each, then combines.
 */
export async function generateSessionSummary(
  transcriptContent: string,
  signal?: AbortSignal,
): Promise<GeneratedSummary> {
  const llm = createLLMService();

  if (transcriptContent.length <= MAX_SINGLE_PASS_CHARS) {
    // Single-pass summary
    const result = await llm.chat({
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the session transcript:\n\n${transcriptContent}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    });

    if (!result.ok) {
      throw new Error(`LLM generation failed: ${result.error.message}`);
    }

    return parseLLMJson(result.value.message.content);
  }

  // Multi-pass: chunk → summarize each → combine
  const chunks = splitIntoChunks(transcriptContent);
  const chunkSummaries: GeneratedSummary[] = [];

  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new Error("Summary generation cancelled");
    }

    const result = await llm.chat({
      messages: [
        { role: "system", content: CHUNK_SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is a portion of the session transcript:\n\n${chunk}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1024,
    });

    if (!result.ok) {
      throw new Error(`LLM chunk summary failed: ${result.error.message}`);
    }

    chunkSummaries.push(parseLLMJson(result.value.message.content));
  }

  // Combine chunk summaries
  const combinedInput = chunkSummaries
    .map(
      (s, i) =>
        `--- Part ${i + 1} ---\n${JSON.stringify(s, null, 2)}`
    )
    .join("\n\n");

  const combineResult = await llm.chat({
    messages: [
      { role: "system", content: COMBINE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here are the partial summaries to combine:\n\n${combinedInput}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 2048,
  });

  if (!combineResult.ok) {
    throw new Error(`LLM combine failed: ${combineResult.error.message}`);
  }

  return parseLLMJson(combineResult.value.message.content);
}
