/**
 * Generation Module Types
 *
 * Shared type definitions for content generators used by the GM assistant.
 */

import type { AnswerSource } from "@/modules/query/rag/types.js";

// ============================================================================
// Adventure Hook Types
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

/** Parameters for generating adventure hooks */
export interface AdventureHookRequest {
  /** Campaign ID to retrieve setting context from */
  campaignId: string;
  /** Desired tone for the generated hooks */
  tone: HookTone;
  /** Optional theme to focus hooks around (e.g. "undead", "trade war") */
  theme?: string;
  /** Optional party level to calibrate challenge appropriateness */
  partyLevel?: number;
  /** Maximum number of chunks to use for setting context (default: 6) */
  maxContextChunks?: number;
}

/** A single generated adventure hook */
export interface AdventureHook {
  /** Short title for the hook */
  title: string;
  /** The hook description (2-4 sentences) */
  description: string;
  /** NPCs involved or mentioned */
  npcs: string[];
  /** Locations referenced */
  locations: string[];
  /** Factions involved */
  factions: string[];
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
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
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
