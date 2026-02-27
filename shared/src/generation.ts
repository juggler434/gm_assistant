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
  partyLevel?: number;
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
