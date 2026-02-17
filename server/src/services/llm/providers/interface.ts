// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * LLM Provider Interface
 *
 * Defines the contract that all LLM providers must implement.
 */

import type { Result } from "@/types/index.js";
import type { LLMError } from "../errors.js";
import type {
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from "../types.js";

/** Interface for LLM providers */
export interface LLMProvider {
  /** Provider name (e.g., "ollama", "openai") */
  readonly name: string;

  /**
   * Generate text completion from a prompt.
   * @param request - The generation request
   * @returns Result with response or error
   */
  generate(
    request: GenerateRequest
  ): Promise<Result<GenerateResponse, LLMError>>;

  /**
   * Generate text completion with streaming.
   * @param request - The generation request
   * @yields Stream chunks
   * @throws LLMError on failure
   */
  generateStream(request: GenerateRequest): AsyncGenerator<StreamChunk>;

  /**
   * Generate chat completion from messages.
   * @param request - The chat request
   * @returns Result with response or error
   */
  chat(request: ChatRequest): Promise<Result<ChatResponse, LLMError>>;

  /**
   * Generate chat completion with streaming.
   * @param request - The chat request
   * @yields Stream chunks
   * @throws LLMError on failure
   */
  chatStream(request: ChatRequest): AsyncGenerator<StreamChunk>;

  /**
   * Check if the provider is healthy and reachable.
   * @returns true if healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;
}
