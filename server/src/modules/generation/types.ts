// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Generation Module Types
 *
 * Shared type definitions for content generators used by the GM assistant.
 */

import type {
  AnswerSource,
  AdventureHook,
  HookTone,
  TokenUsage,
  NpcTone,
  GeneratedNpc,
} from "@gm-assistant/shared";

export type { AnswerSource, AdventureHook, HookTone, NpcTone, GeneratedNpc };

// ============================================================================
// Adventure Hook Types
// ============================================================================

/** Parameters for generating adventure hooks (server-internal) */
export interface AdventureHookRequest {
  /** Campaign ID to retrieve setting context from */
  campaignId: string;
  /** Desired tone for the generated hooks */
  tone: HookTone;
  /** Optional theme to focus hooks around (e.g. "undead", "trade war") */
  theme?: string;
  /** Optional party level to calibrate challenge appropriateness */
  partyLevel?: number;
  /** Number of hooks to generate (1-10, default: 3-5 range) */
  count?: number;
  /** Maximum number of chunks to use for setting context (default: 6) */
  maxContextChunks?: number;
  /** Comma-separated NPCs/locations to specifically include in hooks */
  includeNpcsLocations?: string;
}

/** Result of adventure hook generation */
export interface AdventureHookResult {
  /** The generated adventure hooks (3-5) */
  hooks: AdventureHook[];
  /** Sources from setting documents used as context */
  sources: AnswerSource[];
  /** Number of setting chunks used */
  chunksUsed: number;
  /** Token usage from the LLM, if available */
  usage?: TokenUsage;
}

/** Error types for adventure hook generation */
export interface AdventureHookError {
  code:
    | "INVALID_REQUEST"
    | "EMBEDDING_FAILED"
    | "SEARCH_FAILED"
    | "GENERATION_FAILED"
    | "PARSE_ERROR";
  message: string;
  cause?: unknown;
}

// ============================================================================
// NPC Generation Types
// ============================================================================

/** Parameters for generating NPCs (server-internal) */
export interface NpcGenerationRequest {
  campaignId: string;
  tone: NpcTone;
  race?: string;
  classRole?: string;
  level?: string;
  importance?: string;
  count?: number;
  includeStatBlock?: boolean;
  constraints?: string;
  maxContextChunks?: number;
}

/** Result of NPC generation */
export interface NpcGenerationResult {
  npcs: GeneratedNpc[];
  sources: AnswerSource[];
  chunksUsed: number;
  usage?: TokenUsage;
}

/** Error types for NPC generation */
export interface NpcGenerationError {
  code:
    | "INVALID_REQUEST"
    | "EMBEDDING_FAILED"
    | "SEARCH_FAILED"
    | "GENERATION_FAILED"
    | "PARSE_ERROR";
  message: string;
  cause?: unknown;
}
