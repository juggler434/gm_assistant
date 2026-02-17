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
