// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Adventure Hook Generator
 *
 * Generates 3-5 adventure hooks grounded in campaign setting context.
 * Uses the RAG pipeline to retrieve relevant setting details (NPCs,
 * locations, factions) and feeds them to the LLM for hook generation.
 */

import { type Result, ok, err } from "@/types/index.js";
import { config } from "@/config/index.js";
import type { LLMService } from "@/services/llm/service.js";
import {
  searchChunksHybrid,
  type HybridSearchOptions,
} from "@/modules/knowledge/retrieval/hybrid-search.js";
import { buildContext } from "@/modules/query/rag/context-builder.js";
import type { AnswerSource } from "@/modules/query/rag/types.js";
import { buildAdventureHookPrompt } from "../prompts/adventure-hooks.js";
import type {
  AdventureHookRequest,
  AdventureHook,
  AdventureHookResult,
  AdventureHookError,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

/** Embedding model matching the 1024-dimension chunks table */
const EMBEDDING_MODEL = "mxbai-embed-large";

/** Timeout for embedding requests (ms) */
const EMBEDDING_TIMEOUT = 30_000;

/** Default number of chunks to retrieve for setting context */
const DEFAULT_MAX_CONTEXT_CHUNKS = 6;

/** Maximum token budget for setting context */
const MAX_CONTEXT_TOKENS = 2500;

/** LLM temperature for creative generation */
const GENERATION_TEMPERATURE = 0.8;

// ============================================================================
// Ollama Embed Types
// ============================================================================

/** Ollama embed API response */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

// ============================================================================
// Embedding Helper
// ============================================================================

/**
 * Generate an embedding for a setting context query using the Ollama embed API.
 */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], AdventureHookError>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);

  try {
    const response = await fetch(`${config.llm.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [query],
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

// ============================================================================
// Context Query Builder
// ============================================================================

/**
 * Builds a search query to retrieve setting-relevant context for hook generation.
 */
function buildSettingQuery(tone: string, theme?: string, includeNpcsLocations?: string): string {
  const parts = [
    "important NPCs characters factions locations places organizations",
    "setting world lore history conflicts",
  ];

  if (theme) {
    parts.push(theme);
  }

  if (includeNpcsLocations) {
    parts.push(includeNpcsLocations);
  }

  parts.push(`${tone} themes and events`);

  return parts.join(" ");
}

// ============================================================================
// Response Parser
// ============================================================================

/**
 * Parse the LLM JSON response into structured adventure hooks.
 */
function parseHooksResponse(
  content: string,
): Result<AdventureHook[], AdventureHookError> {
  // Strip markdown fencing if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return err({
      code: "PARSE_ERROR",
      message: `Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`,
    });
  }

  // Validate shape
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("hooks" in parsed) ||
    !Array.isArray((parsed as { hooks: unknown }).hooks)
  ) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM response missing required 'hooks' array",
    });
  }

  const rawHooks = (parsed as { hooks: unknown[] }).hooks;
  const hooks: AdventureHook[] = [];

  for (const raw of rawHooks) {
    if (typeof raw !== "object" || raw === null) continue;

    const h = raw as Record<string, unknown>;
    hooks.push({
      title: typeof h.title === "string" ? h.title : "Untitled Hook",
      description: typeof h.description === "string" ? h.description : "",
      npcs: Array.isArray(h.npcs)
        ? h.npcs.filter((n): n is string => typeof n === "string")
        : [],
      locations: Array.isArray(h.locations)
        ? h.locations.filter((l): l is string => typeof l === "string")
        : [],
      factions: Array.isArray(h.factions)
        ? h.factions.filter((f): f is string => typeof f === "string")
        : [],
    });
  }

  if (hooks.length === 0) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM returned no valid hooks",
    });
  }

  return ok(hooks);
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate adventure hooks grounded in campaign setting context.
 *
 * Pipeline:
 * 1. Build a setting-focused search query from the tone/theme
 * 2. Generate embedding for the query
 * 3. Hybrid search for relevant setting chunks
 * 4. Build context from search results
 * 5. Construct prompt with setting context + generation parameters
 * 6. Call LLM for structured hook generation
 * 7. Parse and return hooks
 *
 * @param request - The adventure hook generation parameters
 * @param llmService - The LLM service instance for generation
 * @returns 3-5 adventure hooks with setting references and source citations
 */
export async function generateAdventureHooks(
  request: AdventureHookRequest,
  llmService: LLMService,
): Promise<Result<AdventureHookResult, AdventureHookError>> {
  const {
    campaignId,
    tone,
    theme,
    partyLevel,
    count,
    maxContextChunks = DEFAULT_MAX_CONTEXT_CHUNKS,
    includeNpcsLocations,
  } = request;

  // ---- Validate input ----
  if (partyLevel !== undefined && (partyLevel < 1 || partyLevel > 20)) {
    return err({
      code: "INVALID_REQUEST",
      message: "Party level must be between 1 and 20",
    });
  }

  // ---- Step 1: Build setting-focused search query ----
  const settingQuery = buildSettingQuery(tone, theme, includeNpcsLocations);

  // ---- Step 2: Generate query embedding ----
  const embeddingResult = await generateQueryEmbedding(settingQuery);
  if (!embeddingResult.ok) {
    return err(embeddingResult.error);
  }

  // ---- Step 3: Hybrid search for setting context ----
  const searchOptions: HybridSearchOptions = {
    limit: maxContextChunks,
    documentTypes: ["setting", "notes"],
  };

  const searchResult = await searchChunksHybrid(
    settingQuery,
    embeddingResult.value,
    campaignId,
    searchOptions,
  );

  if (!searchResult.ok) {
    return err({
      code: "SEARCH_FAILED",
      message: `Setting context search failed: ${searchResult.error.message}`,
      cause: searchResult.error,
    });
  }

  // ---- Step 4: Build context from search results ----
  const context = buildContext(searchResult.value, {
    maxTokens: MAX_CONTEXT_TOKENS,
  });

  // ---- Step 5: Build prompt ----
  const promptOptions: { theme?: string; partyLevel?: number; count?: number; includeNpcsLocations?: string } = {};
  if (theme !== undefined) promptOptions.theme = theme;
  if (partyLevel !== undefined) promptOptions.partyLevel = partyLevel;
  if (count !== undefined) promptOptions.count = count;
  if (includeNpcsLocations !== undefined) promptOptions.includeNpcsLocations = includeNpcsLocations;

  const { system, user } = buildAdventureHookPrompt(context, tone, promptOptions);

  // ---- Step 6: Call LLM ----
  const chatResult = await llmService.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: GENERATION_TEMPERATURE,
  });

  if (!chatResult.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: `LLM generation failed: ${chatResult.error.message}`,
      cause: chatResult.error,
    });
  }

  // ---- Step 7: Parse response ----
  const parseResult = parseHooksResponse(chatResult.value.message.content);
  if (!parseResult.ok) {
    return err(parseResult.error);
  }

  // Map context sources to answer sources
  const sources: AnswerSource[] = context.sources.map((s) => ({
    documentName: s.documentName,
    documentId: s.documentId,
    documentType: s.documentType,
    pageNumber: s.pageNumber,
    section: s.section,
    relevanceScore: s.relevanceScore,
  }));

  const result: AdventureHookResult = {
    hooks: parseResult.value,
    sources,
    chunksUsed: context.chunksUsed,
  };
  if (chatResult.value.usage) {
    result.usage = chatResult.value.usage;
  }

  return ok(result);
}
