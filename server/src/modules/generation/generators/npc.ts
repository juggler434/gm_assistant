// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * NPC Generator
 *
 * Generates NPCs grounded in campaign setting context.
 * Uses the RAG pipeline to retrieve relevant setting details (races, classes,
 * factions, lore) and feeds them to the LLM for NPC generation.
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
import { buildNpcPrompt } from "../prompts/npcs.js";
import { searchEntities, mergeEntityResults } from "./entity-search.js";
import type {
  NpcGenerationRequest,
  GeneratedNpc,
  NpcGenerationResult,
  NpcGenerationError,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CONTEXT_CHUNKS = 6;
const MAX_CONTEXT_TOKENS = 3000;
const GENERATION_TEMPERATURE = 0.85;
const GENERATION_MAX_TOKENS = 8192;
const GENERATION_CONTEXT_SIZE = 16384;

// ============================================================================
// Embedding Helper
// ============================================================================

/** Map shared EmbeddingError to NpcGenerationError */
function mapEmbeddingError(e: EmbeddingError): NpcGenerationError {
  return { code: "EMBEDDING_FAILED", message: e.message, cause: e.cause };
}

/** Generate a query embedding, mapping errors to NpcGenerationError */
async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], NpcGenerationError>> {
  const result = await generateEmbedding(query);
  if (!result.ok) return err(mapEmbeddingError(result.error));
  return result;
}

// ============================================================================
// Context Query Builder
// ============================================================================

function buildSettingQuery(tone: string, constraints?: string): string {
  const parts = [
    "races species classes roles NPCs setting world lore society culture",
  ];

  if (constraints) {
    parts.push(constraints);
  }

  parts.push(`${tone} characters and personalities`);

  return parts.join(" ");
}

// ============================================================================
// Truncated JSON Recovery
// ============================================================================

/**
 * Attempts to recover complete NPC objects from truncated JSON.
 * When the LLM hits the token limit, the JSON is cut off mid-response.
 * This extracts any fully-formed NPC objects before the truncation point.
 */
function recoverTruncatedNpcs(text: string): unknown | null {
  // Find the start of the npcs array
  const arrayStart = text.indexOf("[", text.indexOf('"npcs"'));
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
    return { npcs: recovered };
  } catch {
    return null;
  }
}

// ============================================================================
// Response Parser
// ============================================================================

function parseNpcsResponse(
  content: string,
  hasRulebookChunks: boolean,
): Result<GeneratedNpc[], NpcGenerationError> {
  // Strip markdown fencing if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Attempt to recover complete NPCs from truncated JSON
    const recovered = recoverTruncatedNpcs(cleaned);
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
    !("npcs" in parsed) ||
    !Array.isArray((parsed as { npcs: unknown }).npcs)
  ) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM response missing required 'npcs' array",
    });
  }

  const rawNpcs = (parsed as { npcs: unknown[] }).npcs;
  const npcs: GeneratedNpc[] = [];

  for (const raw of rawNpcs) {
    if (typeof raw !== "object" || raw === null) continue;

    const n = raw as Record<string, unknown>;

    // Determine statBlockGrounded: only true if LLM says true AND we have rulebook chunks
    const llmSaysGrounded = n.statBlockGrounded === true;
    const statBlockGrounded = llmSaysGrounded && hasRulebookChunks;

    npcs.push({
      name: typeof n.name === "string" ? n.name : "Unnamed NPC",
      race: typeof n.race === "string" ? n.race : "",
      classRole: typeof n.classRole === "string" ? n.classRole : "",
      level: typeof n.level === "string" ? n.level : "",
      appearance: typeof n.appearance === "string" ? n.appearance : "",
      personality: typeof n.personality === "string" ? n.personality : "",
      motivations: typeof n.motivations === "string" ? n.motivations : "",
      secrets: typeof n.secrets === "string" ? n.secrets : "",
      backstory: typeof n.backstory === "string" ? n.backstory : "",
      statBlock: typeof n.statBlock === "object" && n.statBlock !== null
        ? n.statBlock as Record<string, unknown>
        : null,
      statBlockGrounded,
    });
  }

  if (npcs.length === 0) {
    return err({
      code: "PARSE_ERROR",
      message: "LLM returned no valid NPCs",
    });
  }

  return ok(npcs);
}

// ============================================================================
// Main Generator
// ============================================================================

export async function generateNpcs(
  request: NpcGenerationRequest,
  llmService: LLMService,
): Promise<Result<NpcGenerationResult, NpcGenerationError>> {
  const {
    campaignId,
    tone,
    race,
    classRole,
    level,
    importance,
    count,
    includeStatBlock,
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
    documentTypes: ["setting", "notes", "rulebook"],
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

  // ---- Step 3b: Entity-specific search for referenced entities in constraints ----
  let mergedResults = searchResult.value;
  if (constraints) {
    const entityResults = await searchEntities(constraints, campaignId, {
      limit: 4,
      documentTypes: ["setting", "notes", "rulebook"],
    });
    mergedResults = mergeEntityResults(entityResults, searchResult.value);
  }

  // Check if any retrieved chunks came from rulebook documents
  const hasRulebookChunks = mergedResults.some(
    (r) => r.document.documentType === "rulebook"
  );

  // ---- Step 4: Build context from search results ----
  const context = buildContext(mergedResults, {
    maxTokens: MAX_CONTEXT_TOKENS,
  });

  // ---- Step 5: Build prompt ----
  const promptOptions: {
    race?: string;
    classRole?: string;
    level?: string;
    importance?: string;
    count?: number;
    includeStatBlock?: boolean;
    constraints?: string;
  } = {};
  if (race !== undefined) promptOptions.race = race;
  if (classRole !== undefined) promptOptions.classRole = classRole;
  if (level !== undefined) promptOptions.level = level;
  if (importance !== undefined) promptOptions.importance = importance;
  if (count !== undefined) promptOptions.count = count;
  if (includeStatBlock !== undefined) promptOptions.includeStatBlock = includeStatBlock;
  if (constraints !== undefined) promptOptions.constraints = constraints;

  const { system, user } = buildNpcPrompt(context, tone, promptOptions);

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
  const parseResult = parseNpcsResponse(
    chatResult.value.message.content,
    hasRulebookChunks,
  );
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

  const result: NpcGenerationResult = {
    npcs: parseResult.value,
    sources,
    chunksUsed: context.chunksUsed,
  };
  if (chatResult.value.usage) {
    result.usage = chatResult.value.usage;
  }

  return ok(result);
}
