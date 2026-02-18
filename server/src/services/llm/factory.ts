// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * LLM Service Factory
 *
 * Creates configured LLM service instances.
 */

import { config } from "@/config/index.js";
import { OllamaProvider } from "./providers/ollama.js";
import { GeminiProvider } from "./providers/gemini.js";
import { LLMService, type LLMServiceOptions } from "./service.js";
import type { LLMConfig } from "./types.js";
import type { LLMProvider } from "./providers/interface.js";

/**
 * Create an LLM service using the application configuration.
 *
 * @param options - Optional service configuration
 * @returns Configured LLM service instance
 *
 * @example
 * ```typescript
 * const llm = createLLMService();
 *
 * // Non-streaming
 * const result = await llm.generate({ prompt: "Hello" });
 * if (result.ok) {
 *   console.log(result.value.text);
 * }
 *
 * // Streaming
 * for await (const chunk of llm.generateStream({ prompt: "Hello" })) {
 *   process.stdout.write(chunk.text);
 * }
 * ```
 */
export function createLLMService(options?: LLMServiceOptions): LLMService {
  const llmConfig: LLMConfig = {
    model: config.llm.model,
    baseUrl: config.llm.baseUrl,
    timeout: config.llm.timeout,
    maxTokens: config.llm.maxTokens,
    temperature: config.llm.temperature,
  };

  const provider = createProvider(llmConfig);
  return new LLMService(provider, llmConfig, options);
}

/**
 * Create an LLM service with custom configuration.
 *
 * @param llmConfig - Custom LLM configuration
 * @param options - Optional service configuration
 * @returns Configured LLM service instance
 */
export function createLLMServiceWithConfig(
  llmConfig: LLMConfig,
  options?: LLMServiceOptions
): LLMService {
  const provider = createProvider(llmConfig);
  return new LLMService(provider, llmConfig, options);
}

function createProvider(llmConfig: LLMConfig): LLMProvider {
  if (config.llm.provider === "google") {
    const apiKey = config.googleAi.apiKey;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_AI_API_KEY is required when LLM_PROVIDER is set to 'google'"
      );
    }
    return new GeminiProvider(llmConfig, apiKey);
  }

  return new OllamaProvider(llmConfig);
}
