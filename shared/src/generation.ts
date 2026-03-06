// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Content generation types.
 * Matches server/src/modules/generation/types.ts and generation route responses.
 */

import type { AnswerSource, TokenUsage } from "./query.js";

// ============================================================================
// Adventure Hook Generation
// ============================================================================

/** Supported tone options for adventure hook generation */
export type HookTone =
  | "dark"
  | "comedic"
  | "political"
  | "mysterious"
  | "heroic"
  | "horror"
  | "intrigue";

/** Request body for POST /api/campaigns/:campaignId/generate/hooks */
export interface GenerateHooksRequest {
  tone: HookTone;
  theme?: string;
  count?: number;
  /** Free-text party level / CR, e.g. "5", "10-12", "low", "any" */
  partyLevel?: string;
  /** Comma-separated NPCs/locations to include in generated hooks */
  includeNpcsLocations?: string;
}

/** A single generated adventure hook */
export interface AdventureHook {
  title: string;
  description: string;
  npcs: string[];
  locations: string[];
  factions: string[];
}

/** Response from POST /api/campaigns/:campaignId/generate/hooks */
export interface GenerateHooksResponse {
  hooks: AdventureHook[];
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

// ============================================================================
// NPC Generation
// ============================================================================

/** Supported tone options for NPC generation */
export type NpcTone =
  | "dark"
  | "comedic"
  | "mysterious"
  | "heroic"
  | "gritty"
  | "whimsical";

/** Request body for POST /api/campaigns/:campaignId/generate/npcs */
export interface GenerateNpcsRequest {
  tone: NpcTone;
  race?: string;
  classRole?: string;
  level?: string;
  importance?: "major" | "minor" | "background";
  count?: number;
  includeStatBlock?: boolean;
  constraints?: string;
}

/** A single generated NPC (preview before saving) */
export interface GeneratedNpc {
  name: string;
  race: string;
  classRole: string;
  level: string;
  appearance: string;
  personality: string;
  motivations: string;
  secrets: string;
  backstory: string;
  statBlock: Record<string, unknown> | null;
  statBlockGrounded: boolean;
}

/** Response from POST /api/campaigns/:campaignId/generate/npcs */
export interface GenerateNpcsResponse {
  npcs: GeneratedNpc[];
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

// ============================================================================
// Location Generation
// ============================================================================

/** Supported tone options for location description generation */
export type LocationTone =
  | "dark"
  | "peaceful"
  | "mysterious"
  | "bustling"
  | "ruined"
  | "magical";

/** Request body for POST /api/campaigns/:campaignId/generate/locations */
export interface GenerateLocationsRequest {
  tone: LocationTone;
  terrain?: string;
  climate?: string;
  size?: "small" | "medium" | "large";
  count?: number;
  constraints?: string;
}

/** A single generated location description */
export interface GeneratedLocation {
  name: string;
  terrain: string;
  climate: string;
  size: string;
  readAloud: string;
  keyFeatures: string[];
  pointsOfInterest: string[];
  sensoryDetails: {
    sights: string;
    sounds: string;
    smells: string;
  };
  encounters: string[];
  secrets: string[];
  npcsPresent: string[];
  factions: string[];
}

/** Response from POST /api/campaigns/:campaignId/generate/locations */
export interface GenerateLocationsResponse {
  locations: GeneratedLocation[];
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

// ============================================================================
// Adventure Outline Generation
// ============================================================================

/** Supported tone options for adventure outline generation (same as hooks) */
export type OutlineTone = HookTone;

/** A single act in a three-act adventure outline structure */
export interface OutlineAct {
  title: string;
  description: string;
  keyEvents: string[];
  encounters: string[];
}

/** Request body for POST /api/campaigns/:campaignId/generate/outlines */
export interface GenerateOutlinesRequest {
  tone: OutlineTone;
  theme?: string;
  count?: number;
  /** Free-text party level / CR, e.g. "5", "10-12", "low", "any" */
  partyLevel?: string;
  /** Comma-separated NPCs/locations to include in generated outlines */
  includeNpcsLocations?: string;
}

/** A single generated adventure outline */
export interface GeneratedAdventureOutline {
  title: string;
  description: string;
  acts: OutlineAct[];
  npcs: string[];
  locations: string[];
  factions: string[];
}

/** Response from POST /api/campaigns/:campaignId/generate/outlines */
export interface GenerateOutlinesResponse {
  outlines: GeneratedAdventureOutline[];
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

// ============================================================================
// SSE Streaming Events (for Accept: text/event-stream)
// ============================================================================

/** SSE event: generation status update */
export interface GenerationStatusEvent {
  type: "status";
  message: string;
}

/** SSE event: a single generated hook */
export interface GenerationHookEvent {
  type: "hook";
  hook: AdventureHook;
}

/** SSE event: a single generated NPC */
export interface GenerationNpcEvent {
  type: "npc";
  npc: GeneratedNpc;
}

/** SSE event: a single generated location */
export interface GenerationLocationEvent {
  type: "location";
  location: GeneratedLocation;
}

/** SSE event: a single generated adventure outline */
export interface GenerationOutlineEvent {
  type: "outline";
  outline: GeneratedAdventureOutline;
}

/** SSE event: generation complete with metadata */
export interface GenerationCompleteEvent {
  type: "complete";
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

/** SSE event: generation error */
export interface GenerationErrorEvent {
  type: "error";
  statusCode: number;
  error: string;
  message: string;
}

/** Union of all SSE event types for hook generation */
export type GenerationSSEEvent =
  | GenerationStatusEvent
  | GenerationHookEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent;

/** Union of all SSE event types for NPC generation */
export type NpcGenerationSSEEvent =
  | GenerationStatusEvent
  | GenerationNpcEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent;

/** Union of all SSE event types for location generation */
export type LocationGenerationSSEEvent =
  | GenerationStatusEvent
  | GenerationLocationEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent;

/** Union of all SSE event types for adventure outline generation */
export type OutlineGenerationSSEEvent =
  | GenerationStatusEvent
  | GenerationOutlineEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent;
