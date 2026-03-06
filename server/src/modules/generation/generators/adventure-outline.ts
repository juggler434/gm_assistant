// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Adventure Outline Generator
 *
 * Generates structured adventure outlines with three-act structure,
 * grounded in campaign setting context. Uses the RAG pipeline to
 * retrieve relevant setting details and feeds them to the LLM.
 */

import { type Result, ok, err } from "@/types/index.js";
import type { LLMService } from "@/services/llm/service.js";
import { generateEmbedding, type EmbeddingError } from "@/services/llm/index.js";
import {
  searchChunksHybrid,
  type HybridSearchOptions,
} from "@/modules/knowledge/retrieval/hybrid-search.js";
import { buildContext } from "@/modules/query/rag/context-builder.js";
import type { AnswerSource } from "@/modules/query/rag/types.js";
import { buildAdventureOutlinePrompt } from "../prompts/adventure-outlines.js";
import { buildCampaignContentContext } from "../campaign-content.js";
import type {
  AdventureOutlineRequest,
  GeneratedAdventureOutline,
  AdventureOutlineResult,
  AdventureOutlineError,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default number of chunks to retrieve for setting context */
const DEFAULT_MAX_CONTEXT_CHUNKS = 8;

/** Maximum token budget for setting context */
const MAX_CONTEXT_TOKENS = 3000;

/** LLM temperature for creative generation */
const GENERATION_TEMPERATURE = 0.8;

/** Max tokens for outline generation (outlines are more detailed than hooks) */
const GENERATION_MAX_TOKENS = 8192;

// ============================================================================
// Embedding Helper
// ============================================================================

/** Map shared EmbeddingError to AdventureOutlineError */
function mapEmbeddingError(e: EmbeddingError): AdventureOutlineError {
  return { code: "EMBEDDING_FAILED", message: e.message, cause: e.cause };
}

/** Generate a query embedding, mapping errors to AdventureOutlineError */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], AdventureOutlineError>> {
  const result = await generateEmbedding(query);
  if (!result.ok) return err(mapEmbeddingError(result.error));
  return result;
}

// ============================================================================
// Context Query Builder
// ============================================================================

/**
 * Builds a search query to retrieve setting-relevant context for outline generation.
 */
function buildSettingQuery(tone: string, theme?: string, includeNpcsLocations?: string): string {
  const parts = [
    "important NPCs characters factions locations places organizations",
    "setting world lore history conflicts quests adventures",
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

interface OutlineAct {
  title: string;
  description: string;
  keyEvents: string[];
  encounters: string[];
}

/**
 * Parse the LLM JSON response into structured adventure outlines.
 */
function parseOutlinesResponse(
  content: string,
): Result<GeneratedAdventureOutline[], AdventureOutlineError> {
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
    !("outlines" in parsed) ||
    !Array.isArray((parsed as { outlines: unknown }).outlines)
  ) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM response missing required 'outlines' array",
    });
  }

  const rawOutlines = (parsed as { outlines: unknown[] }).outlines;
  const outlines: GeneratedAdventureOutline[] = [];

  for (const raw of rawOutlines) {
    if (typeof raw !== "object" || raw === null) continue;

    const o = raw as Record<string, unknown>;
    const acts: OutlineAct[] = [];

    if (Array.isArray(o.acts)) {
      for (const rawAct of o.acts) {
        if (typeof rawAct !== "object" || rawAct === null) continue;
        const a = rawAct as Record<string, unknown>;
        acts.push({
          title: typeof a.title === "string" ? a.title : "Untitled Act",
          description: typeof a.description === "string" ? a.description : "",
          keyEvents: Array.isArray(a.keyEvents)
            ? a.keyEvents.filter((e): e is string => typeof e === "string")
            : [],
          encounters: Array.isArray(a.encounters)
            ? a.encounters.filter((e): e is string => typeof e === "string")
            : [],
        });
      }
    }

    outlines.push({
      title: typeof o.title === "string" ? o.title : "Untitled Outline",
      description: typeof o.description === "string" ? o.description : "",
      acts,
      npcs: Array.isArray(o.npcs)
        ? o.npcs.filter((n): n is string => typeof n === "string")
        : [],
      locations: Array.isArray(o.locations)
        ? o.locations.filter((l): l is string => typeof l === "string")
        : [],
      factions: Array.isArray(o.factions)
        ? o.factions.filter((f): f is string => typeof f === "string")
        : [],
    });
  }

  if (outlines.length === 0) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM returned no valid outlines",
    });
  }

  return ok(outlines);
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate adventure outlines grounded in campaign setting context.
 *
 * Pipeline:
 * 1. Build a setting-focused search query from the tone/theme
 * 2. Generate embedding for the query
 * 3. Hybrid search for relevant setting chunks
 * 4. Build context from search results
 * 5. Construct prompt with setting context + generation parameters
 * 6. Call LLM for structured outline generation
 * 7. Parse and return outlines
 */
export async function generateAdventureOutlines(
  request: AdventureOutlineRequest,
  llmService: LLMService,
): Promise<Result<AdventureOutlineResult, AdventureOutlineError>> {
  const {
    campaignId,
    tone,
    theme,
    partyLevel,
    count,
    maxContextChunks = DEFAULT_MAX_CONTEXT_CHUNKS,
    includeNpcsLocations,
  } = request;

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

  // ---- Step 4b: Fetch saved campaign content ----
  const campaignContent = await buildCampaignContentContext(campaignId);

  // ---- Step 5: Build prompt ----
  const promptOptions: { theme?: string; partyLevel?: string; count?: number; includeNpcsLocations?: string; campaignContent?: typeof campaignContent } = {};
  if (theme !== undefined) promptOptions.theme = theme;
  if (partyLevel !== undefined) promptOptions.partyLevel = partyLevel;
  if (count !== undefined) promptOptions.count = count;
  if (includeNpcsLocations !== undefined) promptOptions.includeNpcsLocations = includeNpcsLocations;
  if (campaignContent.contentText) promptOptions.campaignContent = campaignContent;

  const { system, user } = buildAdventureOutlinePrompt(context, tone, promptOptions);

  // ---- Step 6: Call LLM ----
  const chatResult = await llmService.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: GENERATION_TEMPERATURE,
    maxTokens: GENERATION_MAX_TOKENS,
  });

  if (!chatResult.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: `LLM generation failed: ${chatResult.error.message}`,
      cause: chatResult.error,
    });
  }

  // ---- Step 7: Parse response ----
  const parseResult = parseOutlinesResponse(chatResult.value.message.content);
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
    index: s.index,
  }));

  const result: AdventureOutlineResult = {
    outlines: parseResult.value,
    sources,
    chunksUsed: context.chunksUsed,
  };
  if (chatResult.value.usage) {
    result.usage = chatResult.value.usage;
  }

  return ok(result);
}
