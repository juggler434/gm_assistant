// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Full Adventure Generator - Multi-Step Pipeline
 *
 * Generates complete adventures through a chained LLM pipeline:
 * 1. Generate/load outline (1 call if needed)
 * 2. For each act:
 *    a. Generate locations (1 call)
 *    b. Generate NPCs with location context (1 call)
 *    c. Generate encounters with location + NPC context (1 call)
 *    d. Compose full scenes tying everything together (1 call)
 * 3. Assemble final adventure
 *
 * Each step feeds its results into the next, producing more detailed and
 * coherent adventures than a single monolithic LLM call.
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
import { buildCampaignContentContext } from "../campaign-content.js";
import { findAdventureOutlineByIdAndCampaignId } from "@/modules/adventure-outlines/repository.js";
import {
  buildOutlineStepPrompt,
  buildActLocationsPrompt,
  buildActNpcsPrompt,
  buildActEncountersPrompt,
  buildActScenesPrompt,
  type PipelinePromptContext,
  type ActDescription,
} from "../prompts/adventures.js";
import type {
  AdventureGenerationRequest,
  GeneratedAdventure,
  AdventureGenerationResult,
  AdventureGenerationError,
  AdventurePipelineEvent,
} from "../types.js";
import type {
  AdventureScene,
  NpcDialogueLine,
  SceneEncounter,
  TokenUsage,
} from "@gm-assistant/shared";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CONTEXT_CHUNKS = 10;
const MAX_CONTEXT_TOKENS = 4000;
const GENERATION_TEMPERATURE = 0.8;
const STEP_CONTEXT_SIZE = 16384;

const OUTLINE_MAX_TOKENS = 8192;
const LOCATIONS_MAX_TOKENS = 8192;
const NPCS_MAX_TOKENS = 8192;
const ENCOUNTERS_MAX_TOKENS = 12288;
const SCENES_MAX_TOKENS = 16384;

// ============================================================================
// Pipeline Intermediate Types
// ============================================================================

interface PipelineOutline {
  title: string;
  synopsis: string;
  estimatedDuration: string;
  acts: PipelineAct[];
}

interface PipelineAct {
  actNumber: number;
  title: string;
  description: string;
  keyEvents: string[];
  encounterIdeas: string[];
}

interface PipelineLocation {
  name: string;
  description: string;
  keyFeatures: string[];
  atmosphere: string;
  mapSuggestion: string;
}

interface PipelineNpc {
  name: string;
  role: string;
  personality: string;
  motivations: string;
  appearance: string;
  keyDialogue: { dialogue: string; context: string }[];
}

interface PipelineEncounter {
  name: string;
  description: string;
  difficulty: string;
  creatures: string[];
  tactics: string;
  statBlock: Record<string, unknown> | null;
  locationName: string;
}

// ============================================================================
// Embedding Helper
// ============================================================================

function mapEmbeddingError(e: EmbeddingError): AdventureGenerationError {
  return { code: "EMBEDDING_FAILED", message: e.message, cause: e.cause };
}

async function generateQueryEmbedding(
  query: string,
): Promise<Result<number[], AdventureGenerationError>> {
  const result = await generateEmbedding(query);
  if (!result.ok) return err(mapEmbeddingError(result.error));
  return result;
}

// ============================================================================
// Context Query Builder
// ============================================================================

function buildSettingQuery(tone: string, theme?: string, outlineTitle?: string): string {
  const parts = [
    "important NPCs characters factions locations places organizations",
    "setting world lore history conflicts quests adventures encounters",
    "rules mechanics stat blocks creatures monsters",
  ];
  if (theme) parts.push(theme);
  if (outlineTitle) parts.push(outlineTitle);
  parts.push(`${tone} themes and events`);
  return parts.join(" ");
}

// ============================================================================
// Usage Accumulator
// ============================================================================

function mergeUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!a && !b) return undefined;
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}

// ============================================================================
// JSON Parsing Utilities
// ============================================================================

function cleanJson(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned;
}

function safeParse(content: string): Result<unknown, AdventureGenerationError> {
  const cleaned = cleanJson(content);
  try {
    return ok(JSON.parse(cleaned));
  } catch {
    return err({
      code: "PARSE_ERROR",
      message: `Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`,
    });
  }
}

/**
 * Attempt to recover a truncated JSON array response.
 * When the LLM runs out of tokens mid-JSON, we try to salvage any complete
 * array elements by finding the last complete `}` before the truncation point,
 * then closing the array and outer wrapper object.
 *
 * @param content - raw (possibly truncated) LLM output
 * @param arrayKey - the key of the array in the wrapper object (e.g. "encounters")
 * @returns parsed object or null if recovery fails
 */
function recoverTruncatedArray(content: string, arrayKey: string): unknown | null {
  const cleaned = cleanJson(content);

  // Find the opening of the array
  const arrayPattern = new RegExp(`"${arrayKey}"\\s*:\\s*\\[`);
  const arrayMatch = arrayPattern.exec(cleaned);
  if (!arrayMatch) return null;

  const arrayStart = arrayMatch.index + arrayMatch[0].length;

  // Walk backwards from end to find the last complete object closing brace
  // that could be the end of an array element
  let braceDepth = 0;
  let lastCompleteEnd = -1;

  for (let i = cleaned.length - 1; i >= arrayStart; i--) {
    const ch = cleaned[i];
    if (ch === "}") {
      if (braceDepth === 0) {
        // Potential end of a complete object — verify by trying to parse
        // from array start to here
        const candidate = `{${arrayMatch[0]}${cleaned.slice(arrayStart, i + 1)}]}`;
        try {
          JSON.parse(candidate);
          lastCompleteEnd = i;
          break;
        } catch {
          // Not a valid boundary, keep scanning
          braceDepth++;
        }
      } else {
        braceDepth++;
      }
    } else if (ch === "{") {
      braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  if (lastCompleteEnd === -1) return null;

  const repaired = `{${arrayMatch[0]}${cleaned.slice(arrayStart, lastCompleteEnd + 1)}]}`;
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function asRecord(val: unknown): Record<string, unknown> | null {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return null;
}

function asString(val: unknown, fallback: string): string {
  return typeof val === "string" ? val : fallback;
}

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}

function asNumber(val: unknown, fallback: number): number {
  return typeof val === "number" ? val : fallback;
}

// ============================================================================
// Response Parsers
// ============================================================================

function parseOutlineResponse(
  content: string,
): Result<PipelineOutline, AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const root = asRecord(parseResult.value);
  const raw = root ? asRecord(root.outline) : null;
  if (!raw) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'outline' object" });
  }

  const acts: PipelineAct[] = [];
  if (Array.isArray(raw.acts)) {
    for (let i = 0; i < raw.acts.length; i++) {
      const a = asRecord(raw.acts[i]);
      if (!a) continue;
      acts.push({
        actNumber: asNumber(a.actNumber, i + 1),
        title: asString(a.title, `Act ${i + 1}`),
        description: asString(a.description, ""),
        keyEvents: asStringArray(a.keyEvents),
        encounterIdeas: asStringArray(a.encounterIdeas),
      });
    }
  }

  if (acts.length === 0) {
    return err({ code: "PARSE_ERROR", message: "Outline has no acts" });
  }

  return ok({
    title: asString(raw.title, "Untitled Adventure"),
    synopsis: asString(raw.synopsis, ""),
    estimatedDuration: asString(raw.estimatedDuration, "4-6 hours"),
    acts,
  });
}

function parseLocationsResponse(
  content: string,
): Result<PipelineLocation[], AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const root = asRecord(parseResult.value);
  if (!root || !Array.isArray(root.locations)) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'locations' array" });
  }

  const locations: PipelineLocation[] = [];
  for (const item of root.locations) {
    const r = asRecord(item);
    if (!r) continue;
    locations.push({
      name: asString(r.name, "Unknown Location"),
      description: asString(r.description, ""),
      keyFeatures: asStringArray(r.keyFeatures),
      atmosphere: asString(r.atmosphere, ""),
      mapSuggestion: asString(r.mapSuggestion, ""),
    });
  }

  return ok(locations);
}

function parseNpcsResponse(
  content: string,
): Result<PipelineNpc[], AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const root = asRecord(parseResult.value);
  if (!root || !Array.isArray(root.npcs)) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'npcs' array" });
  }

  const npcs: PipelineNpc[] = [];
  for (const item of root.npcs) {
    const r = asRecord(item);
    if (!r) continue;

    const keyDialogue: { dialogue: string; context: string }[] = [];
    if (Array.isArray(r.keyDialogue)) {
      for (const d of r.keyDialogue) {
        const dr = asRecord(d);
        if (dr) {
          keyDialogue.push({
            dialogue: asString(dr.dialogue, ""),
            context: asString(dr.context, ""),
          });
        }
      }
    }

    npcs.push({
      name: asString(r.name, "Unknown NPC"),
      role: asString(r.role, ""),
      personality: asString(r.personality, ""),
      motivations: asString(r.motivations, ""),
      appearance: asString(r.appearance, ""),
      keyDialogue,
    });
  }

  return ok(npcs);
}

function parseEncountersResponse(
  content: string,
): Result<PipelineEncounter[], AdventureGenerationError> {
  const parseResult = safeParse(content);

  // If parsing failed (e.g. truncated output), try to recover partial encounters
  const parsed = parseResult.ok
    ? parseResult.value
    : recoverTruncatedArray(content, "encounters");
  if (parsed == null) {
    return parseResult.ok
      ? err({ code: "PARSE_ERROR", message: "LLM response missing 'encounters' array" })
      : parseResult;
  }

  const root = asRecord(parsed);
  if (!root || !Array.isArray(root.encounters)) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'encounters' array" });
  }

  const encounters: PipelineEncounter[] = [];
  for (const item of root.encounters) {
    const r = asRecord(item);
    if (!r) continue;
    encounters.push({
      name: asString(r.name, "Unknown Encounter"),
      description: asString(r.description, ""),
      difficulty: asString(r.difficulty, "medium"),
      creatures: asStringArray(r.creatures),
      tactics: asString(r.tactics, ""),
      statBlock:
        typeof r.statBlock === "object" && r.statBlock !== null
          ? (r.statBlock as Record<string, unknown>)
          : null,
      locationName: asString(r.locationName, ""),
    });
  }

  if (encounters.length === 0) {
    return err({ code: "PARSE_ERROR", message: "No valid encounters could be parsed from LLM response" });
  }

  return ok(encounters);
}

function parseScenesResponse(
  content: string,
  actNumber: number,
): Result<AdventureScene[], AdventureGenerationError> {
  const parseResult = safeParse(content);

  // If parsing failed (e.g. truncated output), try to recover partial scenes
  const parsed = parseResult.ok
    ? parseResult.value
    : recoverTruncatedArray(content, "scenes");
  if (parsed == null) {
    return parseResult.ok
      ? err({ code: "PARSE_ERROR", message: "LLM response missing 'scenes' array" })
      : parseResult;
  }

  const root = asRecord(parsed);
  if (!root || !Array.isArray(root.scenes)) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'scenes' array" });
  }

  const scenes: AdventureScene[] = [];
  for (const item of root.scenes) {
    const s = asRecord(item);
    if (!s) continue;

    const npcDialogue: NpcDialogueLine[] = [];
    if (Array.isArray(s.npcDialogue)) {
      for (const d of s.npcDialogue) {
        const dr = asRecord(d);
        if (dr) {
          npcDialogue.push({
            npcName: asString(dr.npcName, "Unknown NPC"),
            dialogue: asString(dr.dialogue, ""),
            context: asString(dr.context, ""),
          });
        }
      }
    }

    const encounters: SceneEncounter[] = [];
    if (Array.isArray(s.encounters)) {
      for (const e of s.encounters) {
        const er = asRecord(e);
        if (!er) continue;
        encounters.push({
          name: asString(er.name, "Unknown Encounter"),
          description: asString(er.description, ""),
          difficulty: asString(er.difficulty, "medium"),
          creatures: asStringArray(er.creatures),
          tactics: asString(er.tactics, ""),
          statBlock: null, // merged from encounter step below
        });
      }
    }

    scenes.push({
      title: asString(s.title, "Untitled Scene"),
      actNumber: asNumber(s.actNumber, actNumber),
      description: asString(s.description, ""),
      readAloud: asString(s.readAloud, ""),
      npcDialogue,
      encounters,
      treasure: asStringArray(s.treasure),
      mapSuggestion: asString(s.mapSuggestion, ""),
    });
  }

  if (scenes.length === 0) {
    return err({ code: "PARSE_ERROR", message: `No valid scenes for Act ${actNumber}` });
  }

  return ok(scenes);
}

// ============================================================================
// NPC Name Deduplication
// ============================================================================

/**
 * Find NPC names that collide with already-used names or are duplicated
 * within the batch itself (case-insensitive first-name match).
 */
function findDuplicateNpcNames(
  npcs: PipelineNpc[],
  usedNames: Set<string>,
): Set<number> {
  const dupeIndices = new Set<number>();
  const usedLower = new Set([...usedNames].map((n) => n.toLowerCase()));
  const batchSeen = new Map<string, number>(); // lowercase name → first index

  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (!npc) continue;
    const lower = npc.name.toLowerCase();
    // Also check just the first name (before space) for partial matches like
    // "Kaelen" vs "Kaelen Ashford"
    const firstName = lower.split(/\s+/)[0] ?? lower;

    if (usedLower.has(lower) || usedLower.has(firstName)) {
      dupeIndices.add(i);
    } else if (batchSeen.has(lower) || batchSeen.has(firstName)) {
      // Duplicate within the same batch — flag the later one
      dupeIndices.add(i);
    } else {
      batchSeen.set(lower, i);
      if (firstName !== lower) {
        batchSeen.set(firstName, i);
      }
    }
  }

  return dupeIndices;
}

/**
 * Deterministic rename for NPCs that still have duplicate names after retry.
 * Appends a role-based surname to make the name unique.
 */
function renameDuplicateNpcs(
  npcs: PipelineNpc[],
  dupeIndices: Set<number>,
  usedNames: Set<string>,
): void {
  const usedLower = new Set([...usedNames].map((n) => n.toLowerCase()));
  // Also include non-duplicate names from this batch
  for (let i = 0; i < npcs.length; i++) {
    if (!dupeIndices.has(i)) {
      usedLower.add(npcs[i]!.name.toLowerCase());
    }
  }

  for (const idx of dupeIndices) {
    const npc = npcs[idx];
    if (!npc) continue;
    // Try appending role-derived words to make the name unique
    const roleWords = npc.role
      .split(/[\s,]+/)
      .filter((w) => w.length > 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    let renamed = false;
    for (const word of roleWords) {
      const candidate = `${npc.name} "${word}"`;
      if (!usedLower.has(candidate.toLowerCase())) {
        npc.name = candidate;
        usedLower.add(candidate.toLowerCase());
        renamed = true;
        break;
      }
    }

    // Fallback: append numeric suffix
    if (!renamed) {
      let suffix = 2;
      while (usedLower.has(`${npc.name} ${suffix}`.toLowerCase())) {
        suffix++;
      }
      npc.name = `${npc.name} ${suffix}`;
      usedLower.add(npc.name.toLowerCase());
    }
  }
}

// ============================================================================
// LLM Call Helper
// ============================================================================

async function callLLM(
  llmService: LLMService,
  system: string,
  user: string,
  maxTokens: number,
): Promise<Result<{ content: string; usage?: TokenUsage | undefined }, AdventureGenerationError>> {
  const result = await llmService.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: GENERATION_TEMPERATURE,
    maxTokens,
    contextSize: STEP_CONTEXT_SIZE,
  });

  if (!result.ok) {
    return err({
      code: "GENERATION_FAILED",
      message: `LLM call failed: ${result.error.message}`,
      cause: result.error,
    });
  }

  return ok({
    content: result.value.message.content,
    usage: result.value.usage,
  });
}

// ============================================================================
// Pipeline Step Functions
// ============================================================================

async function generateOutlineStep(
  ctx: PipelinePromptContext,
  tone: string,
  options: { theme?: string | undefined; partyLevel?: string | undefined },
  llmService: LLMService,
): Promise<
  Result<{ outline: PipelineOutline; usage?: TokenUsage | undefined }, AdventureGenerationError>
> {
  const { system, user } = buildOutlineStepPrompt(ctx, tone as Parameters<typeof buildOutlineStepPrompt>[1], options);
  const llmResult = await callLLM(llmService, system, user, OUTLINE_MAX_TOKENS);
  if (!llmResult.ok) return llmResult;

  const parseResult = parseOutlineResponse(llmResult.value.content);
  if (!parseResult.ok) return parseResult;

  return ok({ outline: parseResult.value, usage: llmResult.value.usage });
}

async function generateLocationsStep(
  ctx: PipelinePromptContext,
  tone: string,
  act: ActDescription,
  options: { theme?: string | undefined },
  llmService: LLMService,
): Promise<
  Result<{ locations: PipelineLocation[]; usage?: TokenUsage | undefined }, AdventureGenerationError>
> {
  const { system, user } = buildActLocationsPrompt(ctx, tone as Parameters<typeof buildActLocationsPrompt>[1], act, options);
  const llmResult = await callLLM(llmService, system, user, LOCATIONS_MAX_TOKENS);
  if (!llmResult.ok) return llmResult;

  const parseResult = parseLocationsResponse(llmResult.value.content);
  if (!parseResult.ok) return parseResult;

  return ok({ locations: parseResult.value, usage: llmResult.value.usage });
}

async function generateNpcsStep(
  ctx: PipelinePromptContext,
  tone: string,
  act: ActDescription,
  locations: PipelineLocation[],
  options: { theme?: string | undefined; previousNpcNames?: string[] | undefined },
  llmService: LLMService,
): Promise<
  Result<{ npcs: PipelineNpc[]; usage?: TokenUsage | undefined }, AdventureGenerationError>
> {
  const locationSummaries = locations.map((l) => ({
    name: l.name,
    description: l.description,
  }));
  const { system, user } = buildActNpcsPrompt(ctx, tone as Parameters<typeof buildActNpcsPrompt>[1], act, locationSummaries, options);
  const llmResult = await callLLM(llmService, system, user, NPCS_MAX_TOKENS);
  if (!llmResult.ok) return llmResult;

  const parseResult = parseNpcsResponse(llmResult.value.content);
  if (!parseResult.ok) return parseResult;

  return ok({ npcs: parseResult.value, usage: llmResult.value.usage });
}

async function generateEncountersStep(
  ctx: PipelinePromptContext,
  tone: string,
  act: ActDescription,
  locations: PipelineLocation[],
  npcs: PipelineNpc[],
  options: { partyLevel?: string | undefined; includeStatBlocks?: boolean | undefined; theme?: string | undefined },
  llmService: LLMService,
): Promise<
  Result<{ encounters: PipelineEncounter[]; usage?: TokenUsage | undefined }, AdventureGenerationError>
> {
  const { system, user } = buildActEncountersPrompt(
    ctx,
    tone as Parameters<typeof buildActEncountersPrompt>[1],
    act,
    locations.map((l) => ({ name: l.name, description: l.description })),
    npcs.map((n) => ({ name: n.name, role: n.role })),
    options,
  );
  const llmResult = await callLLM(llmService, system, user, ENCOUNTERS_MAX_TOKENS);
  if (!llmResult.ok) return llmResult;

  const parseResult = parseEncountersResponse(llmResult.value.content);
  if (!parseResult.ok) return parseResult;

  return ok({ encounters: parseResult.value, usage: llmResult.value.usage });
}

async function composeScenesStep(
  ctx: PipelinePromptContext,
  tone: string,
  outline: PipelineOutline,
  act: ActDescription,
  locations: PipelineLocation[],
  npcs: PipelineNpc[],
  encounters: PipelineEncounter[],
  options: { theme?: string | undefined },
  llmService: LLMService,
): Promise<
  Result<{ scenes: AdventureScene[]; usage?: TokenUsage | undefined }, AdventureGenerationError>
> {
  const { system, user } = buildActScenesPrompt(
    ctx,
    tone as Parameters<typeof buildActScenesPrompt>[1],
    { title: outline.title, synopsis: outline.synopsis },
    act,
    locations,
    npcs.map((n) => ({
      name: n.name,
      role: n.role,
      personality: n.personality,
      appearance: n.appearance,
      keyDialogue: n.keyDialogue,
    })),
    encounters.map((e) => ({
      name: e.name,
      description: e.description,
      difficulty: e.difficulty,
      creatures: e.creatures,
      tactics: e.tactics,
      locationName: e.locationName,
    })),
    options,
  );
  const llmResult = await callLLM(llmService, system, user, SCENES_MAX_TOKENS);
  if (!llmResult.ok) return llmResult;

  const parseResult = parseScenesResponse(llmResult.value.content, act.actNumber);
  if (!parseResult.ok) return parseResult;

  // Merge stat blocks from encounter step into scene encounters by name
  const statBlockMap = new Map<string, Record<string, unknown> | null>();
  for (const enc of encounters) {
    statBlockMap.set(enc.name.toLowerCase(), enc.statBlock);
  }

  for (const scene of parseResult.value) {
    for (const sceneEnc of scene.encounters) {
      const matched = statBlockMap.get(sceneEnc.name.toLowerCase());
      if (matched) {
        sceneEnc.statBlock = matched;
      }
    }
  }

  return ok({ scenes: parseResult.value, usage: llmResult.value.usage });
}

// ============================================================================
// Main Pipeline
// ============================================================================

export async function generateAdventure(
  request: AdventureGenerationRequest,
  llmService: LLMService,
  onProgress?: ((event: AdventurePipelineEvent) => void) | undefined,
): Promise<Result<AdventureGenerationResult, AdventureGenerationError>> {
  const {
    campaignId,
    tone,
    theme,
    partyLevel,
    sourceOutlineId,
    includeStatBlocks,
    maxContextChunks = DEFAULT_MAX_CONTEXT_CHUNKS,
  } = request;

  const emit = onProgress ?? (() => {});
  let totalUsage: TokenUsage | undefined;

  // ==== Step 1: Retrieve setting context ====
  emit({ type: "status", message: "Retrieving campaign context..." });

  const settingQuery = buildSettingQuery(tone, theme);
  const embeddingResult = await generateQueryEmbedding(settingQuery);
  if (!embeddingResult.ok) return err(embeddingResult.error);

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

  const context = buildContext(searchResult.value, { maxTokens: MAX_CONTEXT_TOKENS });
  const campaignContent = await buildCampaignContentContext(campaignId);

  // Build source legend for citation prompts
  const sourceLegend = context.sources
    .map((s) => {
      const info = [`[${s.index}] ${s.documentName}`];
      if (s.section) info.push(`- ${s.section}`);
      if (s.pageNumber !== null) info.push(`(p. ${s.pageNumber})`);
      return info.join(" ");
    })
    .join("\n");

  const promptCtx: PipelinePromptContext = {
    settingText: context.contextText,
    sourceLegend,
    campaignContentText: campaignContent.contentText,
  };

  // If stat blocks are requested, do a targeted rulebook-only search for mechanics/creature stats.
  // This is kept separate from setting context so the LLM can distinguish game rules from lore
  // (setting books may be from a different game system than the rulebook).
  let encounterPromptCtx = promptCtx;
  if (includeStatBlocks !== false) {
    const rulebookQuery =
      "creature stat blocks monster stats AC HP hit points armor class abilities actions attacks combat mechanics challenge rating CR";
    const rulebookEmbResult = await generateQueryEmbedding(rulebookQuery);
    if (rulebookEmbResult.ok) {
      const rulebookSearchResult = await searchChunksHybrid(
        rulebookQuery,
        rulebookEmbResult.value,
        campaignId,
        { limit: 8, documentTypes: ["rulebook"] },
      );
      if (rulebookSearchResult.ok && rulebookSearchResult.value.length > 0) {
        const rulebookContext = buildContext(rulebookSearchResult.value, {
          maxTokens: 3000,
        });
        if (rulebookContext.contextText) {
          encounterPromptCtx = {
            ...promptCtx,
            rulebookText: rulebookContext.contextText,
          };
        }
      }
    }
    // Failures are non-fatal — the encounters step will still work without extra rulebook context
  }

  // ==== Step 2: Get or generate outline ====
  let outline: PipelineOutline;

  if (sourceOutlineId) {
    emit({ type: "status", message: "Loading adventure outline..." });
    const dbOutline = await findAdventureOutlineByIdAndCampaignId(
      sourceOutlineId,
      campaignId,
    );
    if (!dbOutline) {
      return err({
        code: "INVALID_REQUEST",
        message: "Source adventure outline not found",
      });
    }

    // Convert DB outline to pipeline format
    const acts: PipelineAct[] = [];
    const rawActs = dbOutline.acts as {
      title: string;
      description: string;
      keyEvents: string[];
      encounters: string[];
    }[];
    if (Array.isArray(rawActs)) {
      for (let i = 0; i < rawActs.length; i++) {
        const a = rawActs[i];
        if (!a) continue;
        acts.push({
          actNumber: i + 1,
          title: a.title ?? `Act ${i + 1}`,
          description: a.description ?? "",
          keyEvents: Array.isArray(a.keyEvents) ? a.keyEvents : [],
          encounterIdeas: Array.isArray(a.encounters) ? a.encounters : [],
        });
      }
    }

    outline = {
      title: dbOutline.title,
      synopsis: dbOutline.description ?? "",
      estimatedDuration: "4-6 hours",
      acts,
    };
  } else {
    emit({ type: "status", message: "Generating adventure outline..." });
    const outlineResult = await generateOutlineStep(
      promptCtx,
      tone,
      { theme, partyLevel },
      llmService,
    );
    if (!outlineResult.ok) return outlineResult;
    outline = outlineResult.value.outline;
    totalUsage = mergeUsage(totalUsage, outlineResult.value.usage);
  }

  // ==== Step 3: Generate each act ====
  const allScenes: AdventureScene[] = [];
  const allNpcNames = new Set<string>();
  const allLocationNames = new Set<string>();

  for (const act of outline.acts) {
    // 3a: Generate locations
    emit({
      type: "status",
      message: `Act ${act.actNumber}: Generating locations...`,
    });
    const locResult = await generateLocationsStep(
      promptCtx,
      tone,
      act,
      { theme },
      llmService,
    );
    if (!locResult.ok) return locResult;
    const locations = locResult.value.locations;
    totalUsage = mergeUsage(totalUsage, locResult.value.usage);

    // 3b: Generate NPCs (with location context + deduplication)
    emit({
      type: "status",
      message: `Act ${act.actNumber}: Generating NPCs...`,
    });
    const previousNpcNames = allNpcNames.size > 0 ? [...allNpcNames] : undefined;
    let npcResult = await generateNpcsStep(
      promptCtx,
      tone,
      act,
      locations,
      { theme, previousNpcNames },
      llmService,
    );
    if (!npcResult.ok) return npcResult;
    let npcs = npcResult.value.npcs;
    totalUsage = mergeUsage(totalUsage, npcResult.value.usage);

    // Check for duplicate names and retry once if found
    let dupeIndices = findDuplicateNpcNames(npcs, allNpcNames);
    if (dupeIndices.size > 0) {
      const dupeNames = [...dupeIndices].map((i) => npcs[i]!.name);
      const forbiddenNames = [...(previousNpcNames ?? []), ...dupeNames];
      const retryResult = await generateNpcsStep(
        promptCtx,
        tone,
        act,
        locations,
        { theme, previousNpcNames: forbiddenNames },
        llmService,
      );
      if (retryResult.ok) {
        npcs = retryResult.value.npcs;
        totalUsage = mergeUsage(totalUsage, retryResult.value.usage);
      }
      // If retry still has duplicates, rename deterministically
      dupeIndices = findDuplicateNpcNames(npcs, allNpcNames);
      if (dupeIndices.size > 0) {
        renameDuplicateNpcs(npcs, dupeIndices, allNpcNames);
      }
    }

    // 3c: Generate encounters (with location + NPC + rulebook context)
    emit({
      type: "status",
      message: `Act ${act.actNumber}: Generating encounters...`,
    });
    const encResult = await generateEncountersStep(
      encounterPromptCtx,
      tone,
      act,
      locations,
      npcs,
      { partyLevel, includeStatBlocks, theme },
      llmService,
    );
    if (!encResult.ok) return encResult;
    const encounters = encResult.value.encounters;
    totalUsage = mergeUsage(totalUsage, encResult.value.usage);

    // 3d: Compose scenes (ties everything together)
    emit({
      type: "status",
      message: `Act ${act.actNumber}: Composing scenes...`,
    });
    const scenesResult = await composeScenesStep(
      promptCtx,
      tone,
      outline,
      act,
      locations,
      npcs,
      encounters,
      { theme },
      llmService,
    );
    if (!scenesResult.ok) return scenesResult;

    allScenes.push(...scenesResult.value.scenes);
    totalUsage = mergeUsage(totalUsage, scenesResult.value.usage);

    // Collect entity names from this act
    for (const loc of locations) allLocationNames.add(loc.name);
    for (const npc of npcs) allNpcNames.add(npc.name);

    // Emit partial adventure (progressive display)
    emit({
      type: "adventure",
      adventure: {
        title: outline.title,
        synopsis: outline.synopsis,
        estimatedDuration: outline.estimatedDuration,
        scenes: [...allScenes],
        npcs: [...allNpcNames],
        locations: [...allLocationNames],
        factions: [],
      },
    });
  }

  // ==== Step 4: Assemble final adventure ====
  emit({ type: "status", message: "Finalizing adventure..." });

  const adventure: GeneratedAdventure = {
    title: outline.title,
    synopsis: outline.synopsis,
    estimatedDuration: outline.estimatedDuration,
    scenes: allScenes,
    npcs: [...allNpcNames],
    locations: [...allLocationNames],
    factions: [],
  };

  const sources: AnswerSource[] = context.sources.map((s) => ({
    documentName: s.documentName,
    documentId: s.documentId,
    documentType: s.documentType,
    pageNumber: s.pageNumber,
    section: s.section,
    relevanceScore: s.relevanceScore,
    index: s.index,
  }));

  const result: AdventureGenerationResult = {
    adventure,
    sources,
    chunksUsed: context.chunksUsed,
  };
  if (totalUsage) {
    result.usage = totalUsage;
  }

  return ok(result);
}
