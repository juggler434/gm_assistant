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
} from "@gm-assistant/shared";

export type { AnswerSource, AdventureHook, HookTone };

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
  theme?: string | undefined;
  /** Optional party level to calibrate challenge appropriateness */
  partyLevel?: number | undefined;
  /** Maximum number of chunks to use for setting context (default: 6) */
  maxContextChunks?: number | undefined;
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
