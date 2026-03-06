// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Campaign Content Serializer
 *
 * Fetches saved campaign entities (NPCs, adventure hooks, locations) and
 * serializes them into concise text suitable for inclusion in LLM prompts.
 * This lets generators reference existing content for consistency and
 * lets the RAG pipeline answer questions about saved campaign data.
 */

import { findNpcsByCampaignId } from "@/modules/npcs/repository.js";
import { findAdventureHooksByCampaignId } from "@/modules/adventure-hooks/repository.js";
import { findLocationsByCampaignId } from "@/modules/locations/repository.js";
import { findAdventureOutlinesByCampaignId } from "@/modules/adventure-outlines/repository.js";
import { estimateTokens } from "@/modules/query/rag/context-builder.js";
import type { Npc } from "@/db/schema/npcs.js";
import type { AdventureHookRow } from "@/db/schema/adventure-hooks.js";
import type { AdventureOutlineRow } from "@/db/schema/adventure-outlines.js";
import type { Location } from "@/db/schema/locations.js";

// ============================================================================
// Types
// ============================================================================

export interface CampaignContentOptions {
  /** Maximum token budget for campaign content (default: 2000) */
  maxTokens?: number;
}

export interface CampaignContentResult {
  /** The serialized text to include in prompts */
  contentText: string;
  /** Estimated token count of the content text */
  estimatedTokens: number;
  /** Counts of each entity type included */
  counts: {
    npcs: number;
    hooks: number;
    locations: number;
    outlines: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TOKENS = 2000;
const MAX_FIELD_LENGTH = 150;

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Truncates text to a maximum length, adding ellipsis if truncated.
 */
function truncate(text: string | null | undefined, maxLength: number = MAX_FIELD_LENGTH): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Extracts the first sentence from text.
 */
function firstSentence(text: string | null | undefined): string {
  if (!text) return "";
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0] : truncate(text);
}

/**
 * Serializes an NPC into a concise single-line bullet.
 */
export function serializeNpc(npc: Npc): string {
  const parts = [npc.name];

  const details: string[] = [];
  if (npc.race) details.push(npc.race);
  if (npc.classRole) details.push(npc.classRole);
  if (npc.importance) details.push(npc.importance);
  if (details.length > 0) parts.push(`(${details.join(", ")})`);

  parts.push(":");

  const traits: string[] = [];
  if (npc.personality) traits.push(truncate(npc.personality));
  if (npc.motivations) traits.push(truncate(npc.motivations));
  if (traits.length > 0) {
    parts.push(traits.join(" "));
  }

  return `- ${parts.join(" ")}`;
}

/**
 * Serializes an adventure hook into a concise single-line bullet.
 */
export function serializeHook(hook: AdventureHookRow): string {
  const parts = [hook.title + ":"];
  if (hook.description) parts.push(truncate(hook.description));

  const refs: string[] = [];
  if (hook.npcs && hook.npcs.length > 0) refs.push(`NPCs: ${hook.npcs.join(", ")}`);
  if (hook.locations && hook.locations.length > 0) refs.push(`Locations: ${hook.locations.join(", ")}`);
  if (refs.length > 0) parts.push(refs.join(". ") + ".");

  return `- ${parts.join(" ")}`;
}

/**
 * Serializes an adventure outline into a concise single-line bullet.
 */
export function serializeOutline(outline: AdventureOutlineRow): string {
  const parts = [outline.title + ":"];
  if (outline.description) parts.push(truncate(outline.description));

  const actCount = Array.isArray(outline.acts) ? outline.acts.length : 0;
  if (actCount > 0) parts.push(`(${actCount} acts)`);

  const refs: string[] = [];
  if (outline.npcs && outline.npcs.length > 0) refs.push(`NPCs: ${outline.npcs.join(", ")}`);
  if (outline.locations && outline.locations.length > 0) refs.push(`Locations: ${outline.locations.join(", ")}`);
  if (refs.length > 0) parts.push(refs.join(". ") + ".");

  return `- ${parts.join(" ")}`;
}

/**
 * Serializes a location into a concise single-line bullet.
 */
export function serializeLocation(location: Location): string {
  const parts = [location.name];

  const details: string[] = [];
  if (location.terrain) details.push(location.terrain);
  if (location.size) details.push(location.size);
  if (details.length > 0) parts.push(`(${details.join(", ")})`);

  parts.push(":");
  if (location.readAloud) {
    parts.push(firstSentence(location.readAloud));
  }

  return `- ${parts.join(" ")}`;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Fetches all saved campaign entities and serializes them into a concise
 * text block within the specified token budget.
 *
 * Entities are added newest-first until the budget is exhausted.
 * NPCs, hooks, and locations are fetched in parallel.
 */
export async function buildCampaignContentContext(
  campaignId: string,
  options: CampaignContentOptions = {},
): Promise<CampaignContentResult> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Fetch all entity types in parallel (already ordered by createdAt desc)
  const [npcs, hooks, locations, outlines] = await Promise.all([
    findNpcsByCampaignId(campaignId),
    findAdventureHooksByCampaignId(campaignId),
    findLocationsByCampaignId(campaignId),
    findAdventureOutlinesByCampaignId(campaignId),
  ]);

  // Early return if campaign has no saved content
  if (npcs.length === 0 && hooks.length === 0 && locations.length === 0 && outlines.length === 0) {
    return {
      contentText: "",
      estimatedTokens: 0,
      counts: { npcs: 0, hooks: 0, locations: 0, outlines: 0 },
    };
  }

  const sections: string[] = [];
  let totalTokens = 0;
  const counts = { npcs: 0, hooks: 0, locations: 0, outlines: 0 };

  // Helper to add lines from a section while respecting budget
  function addSection(
    heading: string,
    items: string[],
    countKey: "npcs" | "hooks" | "locations" | "outlines",
  ): void {
    if (items.length === 0) return;

    const headingLine = heading;
    const headingTokens = estimateTokens(headingLine + "\n");

    if (totalTokens + headingTokens > maxTokens) return;

    const sectionLines: string[] = [headingLine];
    totalTokens += headingTokens;

    for (const item of items) {
      const itemTokens = estimateTokens(item + "\n");
      if (totalTokens + itemTokens > maxTokens) break;
      sectionLines.push(item);
      totalTokens += itemTokens;
      counts[countKey]++;
    }

    // Only add section if it has at least one item beyond the heading
    if (sectionLines.length > 1) {
      sections.push(sectionLines.join("\n"));
    }
  }

  // Serialize entities (repositories already return newest-first)
  const serializedNpcs = npcs.map(serializeNpc);
  const serializedHooks = hooks.map(serializeHook);
  const serializedLocations = locations.map(serializeLocation);
  const serializedOutlines = outlines.map(serializeOutline);

  addSection("NPCs:", serializedNpcs, "npcs");
  addSection("Adventure Hooks:", serializedHooks, "hooks");
  addSection("Locations:", serializedLocations, "locations");
  addSection("Adventure Outlines:", serializedOutlines, "outlines");

  const contentText = sections.join("\n\n");

  return {
    contentText,
    estimatedTokens: estimateTokens(contentText),
    counts,
  };
}
