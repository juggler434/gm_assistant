// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Location Generator
 *
 * Generates detailed location descriptions grounded in campaign setting context.
 * Uses the RAG pipeline to retrieve relevant setting details (geography, factions,
 * lore) and feeds them to the LLM for location generation.
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
import { buildLocationPrompt } from "../prompts/locations.js";
import type {
  LocationGenerationRequest,
  GeneratedLocation,
  LocationGenerationResult,
  LocationGenerationError,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CONTEXT_CHUNKS = 6;
const MAX_CONTEXT_TOKENS = 2500;
const GENERATION_TEMPERATURE = 0.8;
const GENERATION_MAX_TOKENS = 8192;
const GENERATION_CONTEXT_SIZE = 16384;

// ============================================================================
// Embedding Helper
// ============================================================================

/** Map shared EmbeddingError to LocationGenerationError */
function mapEmbeddingError(e: EmbeddingError): LocationGenerationError {
  return { code: "EMBEDDING_FAILED", message: e.message, cause: e.cause };
}

/** Generate a query embedding, mapping errors to LocationGenerationError */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], LocationGenerationError>> {
  const result = await generateEmbedding(query);
  if (!result.ok) return err(mapEmbeddingError(result.error));
  return result;
}

// ============================================================================
// Context Query Builder
// ============================================================================

function buildSettingQuery(tone: string, constraints?: string): string {
  const parts = [
    "locations geography terrain regions landmarks points of interest setting world lore",
  ];

  if (constraints) {
    parts.push(constraints);
  }

  parts.push(`${tone} places and environments`);

  return parts.join(" ");
}

// ============================================================================
// Truncated JSON Recovery
// ============================================================================

/**
 * Attempts to recover complete location objects from truncated JSON.
 * When the LLM hits the token limit, the JSON is cut off mid-response.
 * This extracts any fully-formed location objects before the truncation point.
 */
function recoverTruncatedLocations(text: string): unknown | null {
  // Find the start of the locations array
  const arrayStart = text.indexOf("[", text.indexOf('"locations"'));
  if (arrayStart === -1) return null;

  // Walk through the text tracking brace depth to find complete objects
  const completeObjects: string[] = [];
  let depth = 0;
  let objectStart = -1;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i];

    // Skip characters inside strings (handle escaped quotes)
    if (ch === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++; // skip escaped char
        i++;
      }
      continue;
    }

    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        completeObjects.push(text.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }

  if (completeObjects.length === 0) return null;

  // Re-parse the recovered objects
  try {
    const recovered = completeObjects.map((obj) => JSON.parse(obj) as unknown);
    return { locations: recovered };
  } catch {
    return null;
  }
}

// ============================================================================
// Response Parser
// ============================================================================

function parseLocationsResponse(
  content: string,
): Result<GeneratedLocation[], LocationGenerationError> {
  // Strip markdown fencing if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Attempt to recover complete locations from truncated JSON
    const recovered = recoverTruncatedLocations(cleaned);
    if (recovered) {
      parsed = recovered;
    } else {
      return err({
        code: "PARSE_ERROR",
        message: `Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`,
      });
    }
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("locations" in parsed) ||
    !Array.isArray((parsed as { locations: unknown }).locations)
  ) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM response missing required 'locations' array",
    });
  }

  const rawLocations = (parsed as { locations: unknown[] }).locations;
  const locations: GeneratedLocation[] = [];

  for (const raw of rawLocations) {
    if (typeof raw !== "object" || raw === null) continue;

    const loc = raw as Record<string, unknown>;

    const sensoryRaw = typeof loc.sensoryDetails === "object" && loc.sensoryDetails !== null
      ? loc.sensoryDetails as Record<string, unknown>
      : {};

    locations.push({
      name: typeof loc.name === "string" ? loc.name : "Unnamed Location",
      terrain: typeof loc.terrain === "string" ? loc.terrain : "",
      climate: typeof loc.climate === "string" ? loc.climate : "",
      size: typeof loc.size === "string" ? loc.size : "",
      readAloud: typeof loc.readAloud === "string" ? loc.readAloud : "",
      keyFeatures: Array.isArray(loc.keyFeatures)
        ? loc.keyFeatures.filter((f): f is string => typeof f === "string")
        : [],
      pointsOfInterest: Array.isArray(loc.pointsOfInterest)
        ? loc.pointsOfInterest.filter((p): p is string => typeof p === "string")
        : [],
      sensoryDetails: {
        sights: typeof sensoryRaw.sights === "string" ? sensoryRaw.sights : "",
        sounds: typeof sensoryRaw.sounds === "string" ? sensoryRaw.sounds : "",
        smells: typeof sensoryRaw.smells === "string" ? sensoryRaw.smells : "",
      },
      encounters: Array.isArray(loc.encounters)
        ? loc.encounters.filter((e): e is string => typeof e === "string")
        : [],
      secrets: Array.isArray(loc.secrets)
        ? loc.secrets.filter((s): s is string => typeof s === "string")
        : [],
      npcsPresent: Array.isArray(loc.npcsPresent)
        ? loc.npcsPresent.filter((n): n is string => typeof n === "string")
        : [],
      factions: Array.isArray(loc.factions)
        ? loc.factions.filter((f): f is string => typeof f === "string")
        : [],
    });
  }

  if (locations.length === 0) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM returned no valid locations",
    });
  }

  return ok(locations);
}

// ============================================================================
// Main Generator
// ============================================================================

export async function generateLocations(
  request: LocationGenerationRequest,
  llmService: LLMService,
): Promise<Result<LocationGenerationResult, LocationGenerationError>> {
  const {
    campaignId,
    tone,
    terrain,
    climate,
    size,
    count,
    constraints,
    maxContextChunks = DEFAULT_MAX_CONTEXT_CHUNKS,
  } = request;

  // ---- Step 1: Build setting-focused search query ----
  const settingQuery = buildSettingQuery(tone, constraints);

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
  const promptOptions: {
    terrain?: string;
    climate?: string;
    size?: string;
    count?: number;
    constraints?: string;
  } = {};
  if (terrain !== undefined) promptOptions.terrain = terrain;
  if (climate !== undefined) promptOptions.climate = climate;
  if (size !== undefined) promptOptions.size = size;
  if (count !== undefined) promptOptions.count = count;
  if (constraints !== undefined) promptOptions.constraints = constraints;

  const { system, user } = buildLocationPrompt(context, tone, promptOptions);

  // ---- Step 6: Call LLM ----
  const chatResult = await llmService.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: GENERATION_TEMPERATURE,
    maxTokens: GENERATION_MAX_TOKENS,
    contextSize: GENERATION_CONTEXT_SIZE,
  });

  if (!chatResult.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: `LLM generation failed: ${chatResult.error.message}`,
      cause: chatResult.error,
    });
  }

  // ---- Step 7: Parse response ----
  const parseResult = parseLocationsResponse(chatResult.value.message.content);
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

  const result: LocationGenerationResult = {
    locations: parseResult.value,
    sources,
    chunksUsed: context.chunksUsed,
  };
  if (chatResult.value.usage) {
    result.usage = chatResult.value.usage;
  }

  return ok(result);
}
