/**
 * LLM Service Public API
 *
 * @example
 * ```typescript
 * import { createLLMService } from "@/services/llm/index.js";
 *
 * const llm = createLLMService();
 *
 * // Non-streaming generation
 * const result = await llm.generate({ prompt: "Hello, world!" });
 * if (result.ok) {
 *   console.log(result.value.text);
 * }
 *
 * // Streaming generation
 * for await (const chunk of llm.generateStream({ prompt: "Tell me a story" })) {
 *   process.stdout.write(chunk.text);
 * }
 *
 * // Chat
 * const chatResult = await llm.chat({
 *   messages: [
 *     { role: "user", content: "What is TypeScript?" }
 *   ]
 * });
 * ```
 */

// Factory functions
export { createLLMService, createLLMServiceWithConfig } from "./factory.js";

// Service class
export { LLMService, type LLMLogger, type LLMServiceOptions } from "./llm.service.js";

// Types
export type {
  MessageRole,
  ChatMessage,
  TokenUsage,
  GenerateOptions,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMConfig,
} from "./types.js";

// Errors
export { LLMError, type LLMErrorCode } from "./errors.js";

// Provider types (for advanced usage)
export type { LLMProvider } from "./providers/index.js";
export { OllamaProvider } from "./providers/index.js";
