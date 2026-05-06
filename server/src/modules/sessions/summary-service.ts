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
// Max transcript tokens to fit in a single LLM call.
// Conservative to leave headroom for system prompt (~400 tokens) + output (~1K tokens)
// even on models with small context windows (8K).
const MAX_SINGLE_PASS_CHARS = 6_000 * CHARS_PER_TOKEN;
// Chunk size for splitting long transcripts
const CHUNK_SIZE_CHARS = 4_000 * CHARS_PER_TOKEN;
// Overlap between chunks to maintain context
const CHUNK_OVERLAP_CHARS = 500 * CHARS_PER_TOKEN;
// If the LLM response is shorter than this, it was likely truncated by
// the model's context limit and we should retry with chunking.
const MIN_VALID_RESPONSE_CHARS = 300;

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
 * Attempt to recover a truncated JSON object by scanning forward to determine
 * the structural state (open strings, arrays, objects) at the truncation point,
 * then appending the necessary closing tokens.
 */
function recoverTruncatedJson(text: string): unknown | null {
  // Forward-scan to track JSON structural state at truncation point
  let inString = false;
  let escape = false;
  const stack: ("}" | "]")[] = []; // closing tokens needed, innermost last

  // Track what came right before truncation (outside strings)
  let lastNonWhitespaceOutsideString = "";

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (escape) { escape = false; continue; }

    if (inString) {
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inString = false; }
      continue;
    }

    // Outside a string
    if (c === '"') { inString = true; continue; }
    if (c === "{") { stack.push("}"); }
    else if (c === "[") { stack.push("]"); }
    else if (c === "}" || c === "]") { stack.pop(); }

    if (c.trim()) lastNonWhitespaceOutsideString = c;
  }

  if (stack.length === 0) return null; // Nothing to close

  // Build a suffix to close the JSON structure
  let suffix = "";

  if (inString) {
    // Truncated inside a string value — close it
    suffix += '"';
  }

  // If the last structural token before truncation was ":" or ","
  // we may be in an incomplete key-value position. Handle edge cases:
  if (!inString) {
    if (lastNonWhitespaceOutsideString === ":") {
      // Value was never started — supply an empty string
      suffix += '""';
    } else if (lastNonWhitespaceOutsideString === ",") {
      // Trailing comma — some parsers choke on this; remove it then retry
      // We'll handle this by trying both with and without
    }
  }

  // Close all open containers from innermost to outermost
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i];
  }

  // Try parsing with the computed suffix
  try {
    return JSON.parse(text + suffix);
  } catch {
    // If trailing comma caused issues, try trimming it
    const trimmed = text.replace(/,\s*$/, "");
    if (trimmed !== text) {
      try {
        return JSON.parse(trimmed + suffix);
      } catch {
        // fall through
      }
    }
  }

  // Last resort: walk backwards to find the last position where closing works
  for (let i = text.length; i > 0; i--) {
    const ch = text[i - 1]!;
    if (ch === '"' || ch === "]" || ch === "}") {
      const candidate = text.slice(0, i);
      let braces = 0;
      let brackets = 0;
      let inStr = false;
      let esc = false;
      for (let j = 0; j < candidate.length; j++) {
        const cc = candidate[j]!;
        if (esc) { esc = false; continue; }
        if (cc === "\\" && inStr) { esc = true; continue; }
        if (cc === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (cc === "{") braces++;
        else if (cc === "}") braces--;
        else if (cc === "[") brackets++;
        else if (cc === "]") brackets--;
      }
      if (inStr) continue;
      const closers = "]".repeat(Math.max(0, brackets)) + "}".repeat(Math.max(0, braces));
      try {
        return JSON.parse(candidate + closers);
      } catch {
        continue;
      }
    }
  }

  return null;
}

interface ParsedLLMJson {
  summary: GeneratedSummary;
  truncated: boolean;
}

/**
 * Parse a JSON response from the LLM, handling potential markdown fences
 * and truncated output. `truncated` is true when JSON recovery had to be
 * used — the caller can decide whether to retry instead of saving partial output.
 */
function parseLLMJson(text: string): ParsedLLMJson {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  let truncated = false;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // LLM response was likely truncated due to token limit — attempt recovery
    parsed = recoverTruncatedJson(cleaned);
    truncated = true;
    if (parsed == null) {
      throw new Error(
        `Failed to parse LLM summary response as JSON (length=${cleaned.length}). ` +
        `Response starts with: ${cleaned.slice(0, 200)}...`
      );
    }
  }

  const obj = parsed as Record<string, unknown>;
  return {
    truncated,
    summary: {
      content: typeof obj.content === "string" ? obj.content : "",
      keyEvents: Array.isArray(obj.keyEvents)
        ? obj.keyEvents.filter((s: unknown) => typeof s === "string")
        : [],
      npcsEncountered: Array.isArray(obj.npcsEncountered)
        ? obj.npcsEncountered.filter((s: unknown) => typeof s === "string")
        : [],
      locationsVisited: Array.isArray(obj.locationsVisited)
        ? obj.locationsVisited.filter((s: unknown) => typeof s === "string")
        : [],
      itemsAcquired: Array.isArray(obj.itemsAcquired)
        ? obj.itemsAcquired.filter((s: unknown) => typeof s === "string")
        : [],
      openQuestions: Array.isArray(obj.openQuestions)
        ? obj.openQuestions.filter((s: unknown) => typeof s === "string")
        : [],
    },
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
      maxTokens: 4096,
    });

    if (!result.ok) {
      throw new Error(`LLM generation failed: ${result.error.message}`);
    }

    const responseText = result.value.message.content;

    // If the response is suspiciously short, the model likely ran out of
    // context window. Fall through to the chunked path instead of failing.
    if (responseText.length >= MIN_VALID_RESPONSE_CHARS) {
      const parsed = parseLLMJson(responseText);
      // If JSON recovery was needed the output is mid-sentence — retry chunked
      // so we don't save a truncated summary.
      if (!parsed.truncated) {
        return parsed.summary;
      }
    }
    // else: fall through to multi-pass chunking below
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

    chunkSummaries.push(parseLLMJson(result.value.message.content).summary);
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
    maxTokens: 4096,
  });

  if (!combineResult.ok) {
    throw new Error(`LLM combine failed: ${combineResult.error.message}`);
  }

  return parseLLMJson(combineResult.value.message.content).summary;
}
