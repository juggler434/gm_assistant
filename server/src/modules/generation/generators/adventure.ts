// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Full Adventure Generator - Node-Based Pipeline
 *
 * Generates complete adventures through a chained LLM pipeline:
 * 1. Retrieve setting context via RAG
 * 2. Generate front (situation) + doom timeline (1 call)
 * 3. Generate node map — interconnected web of locations/events (1 call)
 * 4. For each node: generate full details (5-8 calls)
 * 5. Update doom timeline with node references (1 call)
 * 6. Validate node graph connectivity
 * 7. Assemble final adventure
 *
 * This produces non-linear, situation-based adventures where players
 * explore a web of nodes connected by clues rather than following
 * a predetermined linear path.
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
  buildFrontAndDoomPrompt,
  buildNodeMapPrompt,
  buildNodeDetailPrompt,
  buildDoomTimelineUpdatePrompt,
  type PipelinePromptContext,
  type FrontSummary,
  type DoomTimelineSummary,
  type NodeStub,
} from "../prompts/adventures.js";
import type {
  AdventureGenerationRequest,
  GeneratedAdventure,
  AdventureGenerationResult,
  AdventureGenerationError,
  AdventurePipelineEvent,
} from "../types.js";
import type {
  AdventureFront,
  AdventureNode,
  FactionGoal,
  NodeClue,
  NpcDialogueLine,
  SceneEncounter,
  TimelineEntry,
  TokenUsage,
} from "@gm-assistant/shared";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CONTEXT_CHUNKS = 10;
const MAX_CONTEXT_TOKENS = 4000;
const GENERATION_TEMPERATURE = 0.8;
const STEP_CONTEXT_SIZE = 16384;

const FRONT_DOOM_MAX_TOKENS = 8192;
const NODE_MAP_MAX_TOKENS = 8192;
const NODE_DETAIL_MAX_TOKENS = 12288;
const DOOM_UPDATE_MAX_TOKENS = 4096;

// ============================================================================
// Pipeline Intermediate Types
// ============================================================================

interface PipelineFront {
  title: string;
  synopsis: string;
  estimatedDuration: string;
  front: AdventureFront;
  doomTimeline: TimelineEntry[];
}

interface PipelineNodeStub {
  id: string;
  name: string;
  type: string;
  briefDescription: string;
  isEntryPoint: boolean;
  connections: {
    pointsTo: string;
    clueDescription: string;
    clueType: string;
    isHidden: boolean;
  }[];
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

function buildSettingQuery(tone: string, theme?: string): string {
  const parts = [
    "important NPCs characters factions locations places organizations",
    "setting world lore history conflicts quests adventures encounters",
    "rules mechanics stat blocks creatures monsters",
  ];
  if (theme) parts.push(theme);
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

function asBool(val: unknown, fallback: boolean): boolean {
  return typeof val === "boolean" ? val : fallback;
}

function asNumber(val: unknown, fallback: number): number {
  return typeof val === "number" ? val : fallback;
}

// ============================================================================
// Response Parsers
// ============================================================================

function parseFrontAndDoomResponse(
  content: string,
): Result<PipelineFront, AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const raw = asRecord(parseResult.value);
  if (!raw) {
    return err({ code: "PARSE_ERROR", message: "LLM response is not a JSON object" });
  }

  // Parse front
  const frontRaw = asRecord(raw.front);
  if (!frontRaw) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'front' object" });
  }

  const keyFactions: FactionGoal[] = [];
  if (Array.isArray(frontRaw.keyFactions)) {
    for (const f of frontRaw.keyFactions) {
      const fr = asRecord(f);
      if (fr) {
        keyFactions.push({
          name: asString(fr.name, "Unknown Faction"),
          goal: asString(fr.goal, ""),
          resources: asString(fr.resources, ""),
        });
      }
    }
  }

  const front: AdventureFront = {
    description: asString(frontRaw.description, ""),
    stakes: asString(frontRaw.stakes, ""),
    keyFactions,
  };

  // Parse doom timeline
  const doomTimeline: TimelineEntry[] = [];
  if (Array.isArray(raw.doomTimeline)) {
    for (let i = 0; i < raw.doomTimeline.length; i++) {
      const t = asRecord(raw.doomTimeline[i]);
      if (!t) continue;
      doomTimeline.push({
        stage: asNumber(t.stage, i + 1),
        label: asString(t.label, `Stage ${i + 1}`),
        event: asString(t.event, ""),
        consequence: asString(t.consequence, ""),
        nodesAffected: asStringArray(t.nodesAffected),
      });
    }
  }

  if (doomTimeline.length === 0) {
    return err({ code: "PARSE_ERROR", message: "Doom timeline has no stages" });
  }

  return ok({
    title: asString(raw.title, "Untitled Adventure"),
    synopsis: asString(raw.synopsis, ""),
    estimatedDuration: asString(raw.estimatedDuration, "4-6 hours"),
    front,
    doomTimeline,
  });
}

function parseNodeMapResponse(
  content: string,
): Result<PipelineNodeStub[], AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const root = asRecord(parseResult.value);
  if (!root || !Array.isArray(root.nodes)) {
    return err({ code: "PARSE_ERROR", message: "LLM response missing 'nodes' array" });
  }

  const nodes: PipelineNodeStub[] = [];
  for (let i = 0; i < root.nodes.length; i++) {
    const r = asRecord(root.nodes[i]);
    if (!r) continue;

    const connections: PipelineNodeStub["connections"] = [];
    if (Array.isArray(r.connections)) {
      for (const c of r.connections) {
        const cr = asRecord(c);
        if (cr) {
          connections.push({
            pointsTo: asString(cr.pointsTo, ""),
            clueDescription: asString(cr.clueDescription, ""),
            clueType: asString(cr.clueType, "evidence"),
            isHidden: asBool(cr.isHidden, false),
          });
        }
      }
    }

    nodes.push({
      id: asString(r.id, `n${i + 1}`),
      name: asString(r.name, `Node ${i + 1}`),
      type: asString(r.type, "location"),
      briefDescription: asString(r.briefDescription, ""),
      isEntryPoint: asBool(r.isEntryPoint, false),
      connections,
    });
  }

  if (nodes.length === 0) {
    return err({ code: "PARSE_ERROR", message: "Node map has no nodes" });
  }

  // Ensure at least one entry point
  if (!nodes.some(n => n.isEntryPoint)) {
    nodes[0]!.isEntryPoint = true;
  }

  return ok(nodes);
}

function parseNodeDetailResponse(
  content: string,
  nodeStub: PipelineNodeStub,
): Result<AdventureNode, AdventureGenerationError> {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return parseResult;

  const root = asRecord(parseResult.value);
  const raw = root ? asRecord(root.node) : null;
  if (!raw) {
    return err({ code: "PARSE_ERROR", message: `LLM response missing 'node' object for ${nodeStub.id}` });
  }

  // Parse NPC dialogue
  const npcDialogue: NpcDialogueLine[] = [];
  if (Array.isArray(raw.npcDialogue)) {
    for (const d of raw.npcDialogue) {
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

  // Parse encounters
  const encounters: SceneEncounter[] = [];
  if (Array.isArray(raw.encounters)) {
    for (const e of raw.encounters) {
      const er = asRecord(e);
      if (!er) continue;
      encounters.push({
        name: asString(er.name, "Unknown Encounter"),
        description: asString(er.description, ""),
        difficulty: asString(er.difficulty, "medium"),
        creatures: asStringArray(er.creatures),
        tactics: asString(er.tactics, ""),
        statBlock:
          typeof er.statBlock === "object" && er.statBlock !== null
            ? (er.statBlock as Record<string, unknown>)
            : null,
      });
    }
  }

  // Parse clues
  const clues: NodeClue[] = [];
  if (Array.isArray(raw.clues)) {
    for (const c of raw.clues) {
      const cr = asRecord(c);
      if (cr) {
        const clueType = asString(cr.type, "evidence");
        clues.push({
          description: asString(cr.description, ""),
          pointsTo: asString(cr.pointsTo, ""),
          type: (["evidence", "npc_info", "observation", "document", "trail"].includes(clueType)
            ? clueType
            : "evidence") as NodeClue["type"],
          isHidden: asBool(cr.isHidden, false),
        });
      }
    }
  }

  // Ensure clues from the node stub connections are present
  for (const conn of nodeStub.connections) {
    const hasClue = clues.some(c => c.pointsTo === conn.pointsTo);
    if (!hasClue) {
      const clueType = (["evidence", "npc_info", "observation", "document", "trail"].includes(conn.clueType)
        ? conn.clueType
        : "evidence") as NodeClue["type"];
      clues.push({
        description: conn.clueDescription,
        pointsTo: conn.pointsTo,
        type: clueType,
        isHidden: conn.isHidden,
      });
    }
  }

  const nodeType = asString(raw.type, nodeStub.type);

  return ok({
    id: nodeStub.id,
    name: asString(raw.name, nodeStub.name),
    type: (["location", "event", "encounter", "social"].includes(nodeType)
      ? nodeType
      : "location") as AdventureNode["type"],
    description: asString(raw.description, ""),
    readAloud: asString(raw.readAloud, ""),
    npcDialogue,
    encounters,
    treasure: asStringArray(raw.treasure),
    mapSuggestion: asString(raw.mapSuggestion, ""),
    clues,
    isEntryPoint: nodeStub.isEntryPoint,
  });
}

function parseDoomTimelineUpdateResponse(
  content: string,
  fallback: TimelineEntry[],
): TimelineEntry[] {
  const parseResult = safeParse(content);
  if (!parseResult.ok) return fallback;

  const root = asRecord(parseResult.value);
  if (!root || !Array.isArray(root.doomTimeline)) return fallback;

  const result: TimelineEntry[] = [];
  for (let i = 0; i < root.doomTimeline.length; i++) {
    const t = asRecord(root.doomTimeline[i]);
    if (!t) continue;
    // Merge: keep original event/consequence text, take nodesAffected from update
    const original = fallback[i];
    result.push({
      stage: asNumber(t.stage, original?.stage ?? i + 1),
      label: asString(t.label, original?.label ?? `Stage ${i + 1}`),
      event: asString(t.event, original?.event ?? ""),
      consequence: asString(t.consequence, original?.consequence ?? ""),
      nodesAffected: asStringArray(t.nodesAffected),
    });
  }

  return result.length > 0 ? result : fallback;
}

// ============================================================================
// NPC Name Deduplication
// ============================================================================

/**
 * Extract NPC names from a node's dialogue lines.
 */
function extractNpcNames(node: AdventureNode): string[] {
  return node.npcDialogue.map(d => d.npcName);
}

// ============================================================================
// Node Graph Validation
// ============================================================================

/**
 * Validate node graph connectivity. Logs warnings but does not hard-fail.
 */
function validateNodeGraph(nodes: AdventureNode[]): string[] {
  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  // Check clue references resolve
  for (const node of nodes) {
    for (const clue of node.clues) {
      if (!nodeIds.has(clue.pointsTo)) {
        warnings.push(`Node "${node.name}" (${node.id}) has clue pointing to unknown node "${clue.pointsTo}"`);
      }
    }
  }

  // Check reachability from entry points
  const entryPoints = nodes.filter(n => n.isEntryPoint);
  if (entryPoints.length === 0) {
    warnings.push("No entry point nodes defined");
    return warnings;
  }

  const reachable = new Set<string>();
  const queue = entryPoints.map(n => n.id);
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const currentNode = nodes.find(n => n.id === current);
    if (currentNode) {
      for (const clue of currentNode.clues) {
        if (nodeIds.has(clue.pointsTo) && !reachable.has(clue.pointsTo)) {
          queue.push(clue.pointsTo);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!node.isEntryPoint && !reachable.has(node.id)) {
      warnings.push(`Node "${node.name}" (${node.id}) is not reachable from any entry point`);
    }
  }

  return warnings;
}

// ============================================================================
// LLM Call Helper
// ============================================================================

async function callLLM(
  llmService: LLMService,
  system: string,
  user: string,
  maxTokens: number,
  temperatureOverride?: number,
  customInstructions?: string,
): Promise<Result<{ content: string; usage?: TokenUsage | undefined }, AdventureGenerationError>> {
  const finalSystem = customInstructions
    ? `${system}\n\nAdditional GM instructions:\n${customInstructions}`
    : system;
  const result = await llmService.chat({
    messages: [
      { role: "system", content: finalSystem },
      { role: "user", content: user },
    ],
    temperature: temperatureOverride ?? GENERATION_TEMPERATURE,
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
    temperature,
    customInstructions,
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

  // If stat blocks are requested, do a targeted rulebook search
  let detailPromptCtx = promptCtx;
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
          detailPromptCtx = {
            ...promptCtx,
            rulebookText: rulebookContext.contextText,
          };
        }
      }
    }
  }

  // ==== Step 2: Build outline seed if using a source outline ====
  let outlineSeed: string | undefined;

  if (sourceOutlineId) {
    emit({ type: "status", message: "Loading adventure outline as seed..." });
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

    const seedParts: string[] = [];
    seedParts.push(`Title: ${dbOutline.title}`);
    if (dbOutline.description) seedParts.push(`Synopsis: ${dbOutline.description}`);
    const rawActs = dbOutline.acts as {
      title: string;
      description: string;
      keyEvents: string[];
      encounters: string[];
    }[];
    if (Array.isArray(rawActs)) {
      for (const a of rawActs) {
        seedParts.push(`\n${a.title}: ${a.description}`);
        if (a.keyEvents?.length > 0) seedParts.push(`Key events: ${a.keyEvents.join("; ")}`);
      }
    }
    outlineSeed = seedParts.join("\n");
  }

  // ==== Step 3: Generate front + doom timeline ====
  emit({ type: "status", message: "Generating adventure situation..." });

  const frontDoomPrompt = buildFrontAndDoomPrompt(promptCtx, tone as Parameters<typeof buildFrontAndDoomPrompt>[1], {
    theme,
    partyLevel,
    outlineSeed,
  });
  const frontDoomResult = await callLLM(llmService, frontDoomPrompt.system, frontDoomPrompt.user, FRONT_DOOM_MAX_TOKENS, temperature, customInstructions);
  if (!frontDoomResult.ok) return frontDoomResult;
  totalUsage = mergeUsage(totalUsage, frontDoomResult.value.usage);

  const parsedFrontDoom = parseFrontAndDoomResponse(frontDoomResult.value.content);
  if (!parsedFrontDoom.ok) return parsedFrontDoom;
  const pipelineFront = parsedFrontDoom.value;

  // Build summaries for subsequent prompts
  const frontSummary: FrontSummary = {
    title: pipelineFront.title,
    synopsis: pipelineFront.synopsis,
    description: pipelineFront.front.description,
    stakes: pipelineFront.front.stakes,
    factions: pipelineFront.front.keyFactions.map(f => ({ name: f.name, goal: f.goal })),
  };

  const doomSummary: DoomTimelineSummary = {
    stages: pipelineFront.doomTimeline.map(t => ({
      stage: t.stage,
      label: t.label,
      event: t.event,
    })),
  };

  // ==== Step 4: Generate node map ====
  emit({ type: "status", message: "Designing adventure node map..." });

  const nodeMapPrompt = buildNodeMapPrompt(promptCtx, tone as Parameters<typeof buildNodeMapPrompt>[1], frontSummary, doomSummary, {
    theme,
    partyLevel,
  });
  const nodeMapResult = await callLLM(llmService, nodeMapPrompt.system, nodeMapPrompt.user, NODE_MAP_MAX_TOKENS, temperature, customInstructions);
  if (!nodeMapResult.ok) return nodeMapResult;
  totalUsage = mergeUsage(totalUsage, nodeMapResult.value.usage);

  const parsedNodeMap = parseNodeMapResponse(nodeMapResult.value.content);
  if (!parsedNodeMap.ok) return parsedNodeMap;
  const nodeStubs = parsedNodeMap.value;

  // Convert to NodeStub for prompt types
  const nodeStubsForPrompts: NodeStub[] = nodeStubs.map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
    briefDescription: n.briefDescription,
    isEntryPoint: n.isEntryPoint,
    connections: n.connections,
  }));

  // ==== Step 5: Generate details for each node ====
  const detailedNodes: AdventureNode[] = [];
  const allNpcNames = new Set<string>();

  for (const nodeStub of nodeStubs) {
    emit({
      type: "status",
      message: `Detailing node: ${nodeStub.name}...`,
    });

    const previousNpcNames = allNpcNames.size > 0 ? [...allNpcNames] : undefined;
    const detailPrompt = buildNodeDetailPrompt(
      detailPromptCtx,
      tone as Parameters<typeof buildNodeDetailPrompt>[1],
      frontSummary,
      doomSummary,
      nodeStub,
      nodeStubsForPrompts,
      {
        theme,
        partyLevel,
        includeStatBlocks,
        previousNpcNames,
      },
    );

    const detailResult = await callLLM(llmService, detailPrompt.system, detailPrompt.user, NODE_DETAIL_MAX_TOKENS, temperature, customInstructions);
    if (!detailResult.ok) return detailResult;
    totalUsage = mergeUsage(totalUsage, detailResult.value.usage);

    const parsedNode = parseNodeDetailResponse(detailResult.value.content, nodeStub);
    if (!parsedNode.ok) return parsedNode;

    const node = parsedNode.value;
    detailedNodes.push(node);

    // Collect NPC names for deduplication
    for (const name of extractNpcNames(node)) {
      allNpcNames.add(name);
    }

    // Emit progressive adventure update
    emit({
      type: "adventure",
      adventure: {
        title: pipelineFront.title,
        synopsis: pipelineFront.synopsis,
        estimatedDuration: pipelineFront.estimatedDuration,
        front: pipelineFront.front,
        nodes: [...detailedNodes],
        doomTimeline: pipelineFront.doomTimeline,
        npcs: [...allNpcNames],
        locations: detailedNodes.filter(n => n.type === "location").map(n => n.name),
        factions: pipelineFront.front.keyFactions.map(f => f.name),
      },
    });
  }

  // ==== Step 6: Update doom timeline with node references ====
  emit({ type: "status", message: "Linking timeline to nodes..." });

  const doomUpdatePrompt = buildDoomTimelineUpdatePrompt(frontSummary, doomSummary, nodeStubsForPrompts);
  const doomUpdateResult = await callLLM(llmService, doomUpdatePrompt.system, doomUpdatePrompt.user, DOOM_UPDATE_MAX_TOKENS, temperature, customInstructions);
  let finalTimeline = pipelineFront.doomTimeline;
  if (doomUpdateResult.ok) {
    totalUsage = mergeUsage(totalUsage, doomUpdateResult.value.usage);
    finalTimeline = parseDoomTimelineUpdateResponse(doomUpdateResult.value.content, pipelineFront.doomTimeline);
  }
  // Non-fatal if this step fails — timeline just won't have node references

  // ==== Step 7: Validate node graph ====
  const warnings = validateNodeGraph(detailedNodes);
  if (warnings.length > 0) {
    // Log warnings but don't fail — the adventure is still usable
    for (const w of warnings) {
      // Use emit to surface warnings
      emit({ type: "status", message: `Warning: ${w}` });
    }
  }

  // ==== Step 8: Assemble final adventure ====
  emit({ type: "status", message: "Finalizing adventure..." });

  // Collect all location names from nodes
  const allLocationNames = new Set<string>();
  for (const node of detailedNodes) {
    if (node.type === "location") {
      allLocationNames.add(node.name);
    }
  }

  const adventure: GeneratedAdventure = {
    title: pipelineFront.title,
    synopsis: pipelineFront.synopsis,
    estimatedDuration: pipelineFront.estimatedDuration,
    front: pipelineFront.front,
    nodes: detailedNodes,
    doomTimeline: finalTimeline,
    npcs: [...allNpcNames],
    locations: [...allLocationNames],
    factions: pipelineFront.front.keyFactions.map(f => f.name),
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
