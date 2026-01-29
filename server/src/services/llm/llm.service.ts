/**
 * LLM Service
 *
 * High-level wrapper around LLM providers with logging and config management.
 */

import type { Result } from "@/types/index.js";
import type { LLMProvider } from "./providers/provider.interface.js";
import type { LLMError } from "./errors.js";
import type {
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMConfig,
} from "./types.js";

/** Logger interface for the LLM service */
export interface LLMLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Default console logger - uses warn for all levels to satisfy lint rules */
const defaultLogger: LLMLogger = {
  debug: () => {}, // No-op in production; inject a custom logger for debug output
  info: () => {}, // No-op in production; inject a custom logger for info output
  warn: (msg, data) => console.warn(`[LLM] ${msg}`, data ?? ""),
  error: (msg, data) => console.error(`[LLM] ${msg}`, data ?? ""),
};

export interface LLMServiceOptions {
  logger?: LLMLogger;
}

export class LLMService {
  private readonly provider: LLMProvider;
  private readonly config: LLMConfig;
  private readonly logger: LLMLogger;

  constructor(
    provider: LLMProvider,
    config: LLMConfig,
    options?: LLMServiceOptions
  ) {
    this.provider = provider;
    this.config = config;
    this.logger = options?.logger ?? defaultLogger;
  }

  /** Get the provider name */
  get providerName(): string {
    return this.provider.name;
  }

  /** Get the current model */
  get model(): string {
    return this.config.model;
  }

  /**
   * Generate text completion from a prompt.
   */
  async generate(
    request: GenerateRequest
  ): Promise<Result<GenerateResponse, LLMError>> {
    const mergedRequest = this.mergeDefaults(request);

    this.logger.debug("Generate request", {
      prompt: this.truncate(mergedRequest.prompt, 100),
      maxTokens: mergedRequest.maxTokens,
      temperature: mergedRequest.temperature,
    });

    const startTime = Date.now();
    const result = await this.provider.generate(mergedRequest);
    const durationMs = Date.now() - startTime;

    if (result.ok) {
      this.logger.info("Generate completed", {
        model: result.value.model,
        durationMs,
        usage: result.value.usage,
      });
    } else {
      this.logger.error("Generate failed", {
        error: result.error.toJSON(),
        durationMs,
      });
    }

    return result;
  }

  /**
   * Generate text completion with streaming.
   */
  async *generateStream(request: GenerateRequest): AsyncGenerator<StreamChunk> {
    const mergedRequest = this.mergeDefaults(request);

    this.logger.debug("Generate stream request", {
      prompt: this.truncate(mergedRequest.prompt, 100),
      maxTokens: mergedRequest.maxTokens,
      temperature: mergedRequest.temperature,
    });

    const startTime = Date.now();
    let totalChunks = 0;

    try {
      for await (const chunk of this.provider.generateStream(mergedRequest)) {
        totalChunks++;
        yield chunk;

        if (chunk.done) {
          const durationMs = Date.now() - startTime;
          this.logger.info("Generate stream completed", {
            durationMs,
            totalChunks,
            usage: chunk.usage,
          });
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error("Generate stream failed", {
        error: error instanceof Error ? error.message : String(error),
        durationMs,
        totalChunks,
      });
      throw error;
    }
  }

  /**
   * Generate chat completion from messages.
   */
  async chat(request: ChatRequest): Promise<Result<ChatResponse, LLMError>> {
    const mergedRequest = this.mergeDefaults(request);

    this.logger.debug("Chat request", {
      messageCount: mergedRequest.messages.length,
      maxTokens: mergedRequest.maxTokens,
      temperature: mergedRequest.temperature,
    });

    const startTime = Date.now();
    const result = await this.provider.chat(mergedRequest);
    const durationMs = Date.now() - startTime;

    if (result.ok) {
      this.logger.info("Chat completed", {
        model: result.value.model,
        durationMs,
        usage: result.value.usage,
      });
    } else {
      this.logger.error("Chat failed", {
        error: result.error.toJSON(),
        durationMs,
      });
    }

    return result;
  }

  /**
   * Generate chat completion with streaming.
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const mergedRequest = this.mergeDefaults(request);

    this.logger.debug("Chat stream request", {
      messageCount: mergedRequest.messages.length,
      maxTokens: mergedRequest.maxTokens,
      temperature: mergedRequest.temperature,
    });

    const startTime = Date.now();
    let totalChunks = 0;

    try {
      for await (const chunk of this.provider.chatStream(mergedRequest)) {
        totalChunks++;
        yield chunk;

        if (chunk.done) {
          const durationMs = Date.now() - startTime;
          this.logger.info("Chat stream completed", {
            durationMs,
            totalChunks,
            usage: chunk.usage,
          });
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error("Chat stream failed", {
        error: error instanceof Error ? error.message : String(error),
        durationMs,
        totalChunks,
      });
      throw error;
    }
  }

  /**
   * Check if the LLM provider is healthy.
   */
  async healthCheck(): Promise<boolean> {
    const healthy = await this.provider.healthCheck();
    this.logger.debug("Health check", { healthy, provider: this.provider.name });
    return healthy;
  }

  private mergeDefaults<T extends GenerateRequest | ChatRequest>(
    request: T
  ): T {
    return {
      ...request,
      maxTokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      timeout: request.timeout ?? this.config.timeout,
    };
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }
}
