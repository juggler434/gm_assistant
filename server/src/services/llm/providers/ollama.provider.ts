/**
 * Ollama LLM Provider
 *
 * Implementation of the LLM provider interface for Ollama.
 * Uses the Ollama API for local LLM inference.
 *
 * API Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { ok, err, type Result } from "@/types/index.js";
import { LLMError } from "../errors.js";
import type { LLMProvider } from "./provider.interface.js";
import type {
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMConfig,
  TokenUsage,
  ChatMessage,
} from "../types.js";

/** Ollama API response for generate endpoint */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Ollama API response for chat endpoint */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Ollama API error response */
interface OllamaErrorResponse {
  error: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private readonly config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async generate(
    request: GenerateRequest
  ): Promise<Result<GenerateResponse, LLMError>> {
    const timeout = request.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.model,
            prompt: request.prompt,
            system: request.system,
            stream: false,
            options: {
              num_predict: request.maxTokens ?? this.config.maxTokens,
              temperature: request.temperature ?? this.config.temperature,
              stop: request.stop,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return err(await this.handleErrorResponse(response));
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      return ok(this.mapGenerateResponse(data));
    } catch (error) {
      clearTimeout(timeoutId);
      return err(this.handleFetchError(error, timeout));
    }
  }

  async *generateStream(
    request: GenerateRequest
  ): AsyncGenerator<StreamChunk> {
    const timeout = request.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.model,
            prompt: request.prompt,
            system: request.system,
            stream: true,
            options: {
              num_predict: request.maxTokens ?? this.config.maxTokens,
              temperature: request.temperature ?? this.config.temperature,
              stop: request.stop,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw LLMError.invalidResponse(this.name, "No response body");
      }

      yield* this.parseGenerateStream(response.body);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleFetchError(error, timeout);
    }
  }

  async chat(request: ChatRequest): Promise<Result<ChatResponse, LLMError>> {
    const timeout = request.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.model,
            messages: request.messages,
            stream: false,
            options: {
              num_predict: request.maxTokens ?? this.config.maxTokens,
              temperature: request.temperature ?? this.config.temperature,
              stop: request.stop,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return err(await this.handleErrorResponse(response));
      }

      const data = (await response.json()) as OllamaChatResponse;
      return ok(this.mapChatResponse(data));
    } catch (error) {
      clearTimeout(timeoutId);
      return err(this.handleFetchError(error, timeout));
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const timeout = request.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.model,
            messages: request.messages,
            stream: true,
            options: {
              num_predict: request.maxTokens ?? this.config.maxTokens,
              temperature: request.temperature ?? this.config.temperature,
              stop: request.stop,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw LLMError.invalidResponse(this.name, "No response body");
      }

      yield* this.parseChatStream(response.body);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleFetchError(error, timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async *parseGenerateStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const data = JSON.parse(line) as OllamaGenerateResponse;
          yield {
            text: data.response,
            done: data.done,
            usage: data.done ? this.extractUsage(data) : undefined,
          };
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const data = JSON.parse(buffer) as OllamaGenerateResponse;
        yield {
          text: data.response,
          done: data.done,
          usage: data.done ? this.extractUsage(data) : undefined,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *parseChatStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const data = JSON.parse(line) as OllamaChatResponse;
          yield {
            text: data.message?.content ?? "",
            done: data.done,
            usage: data.done ? this.extractChatUsage(data) : undefined,
          };
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const data = JSON.parse(buffer) as OllamaChatResponse;
        yield {
          text: data.message?.content ?? "",
          done: data.done,
          usage: data.done ? this.extractChatUsage(data) : undefined,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  private mapGenerateResponse(data: OllamaGenerateResponse): GenerateResponse {
    return {
      text: data.response,
      model: data.model,
      usage: this.extractUsage(data),
      durationMs: data.total_duration
        ? Math.round(data.total_duration / 1_000_000)
        : undefined,
    };
  }

  private mapChatResponse(data: OllamaChatResponse): ChatResponse {
    return {
      message: {
        role: data.message.role as ChatMessage["role"],
        content: data.message.content,
      },
      model: data.model,
      usage: this.extractChatUsage(data),
      durationMs: data.total_duration
        ? Math.round(data.total_duration / 1_000_000)
        : undefined,
    };
  }

  private extractUsage(data: OllamaGenerateResponse): TokenUsage | undefined {
    if (data.prompt_eval_count === undefined && data.eval_count === undefined) {
      return undefined;
    }

    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private extractChatUsage(data: OllamaChatResponse): TokenUsage | undefined {
    if (data.prompt_eval_count === undefined && data.eval_count === undefined) {
      return undefined;
    }

    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private async handleErrorResponse(response: Response): Promise<LLMError> {
    let errorMessage: string;
    try {
      const errorData = (await response.json()) as OllamaErrorResponse;
      errorMessage = errorData.error ?? "Unknown error";
    } catch {
      errorMessage = await response.text();
    }

    // Check for specific error conditions
    if (response.status === 404 || errorMessage.includes("not found")) {
      return LLMError.modelNotFound(this.name, this.config.model);
    }

    if (response.status === 429) {
      return LLMError.rateLimited(this.name);
    }

    if (
      errorMessage.includes("context length") ||
      errorMessage.includes("too long")
    ) {
      return LLMError.contextLengthExceeded(this.name, errorMessage);
    }

    return new LLMError(errorMessage, "INVALID_RESPONSE", this.name, {
      statusCode: response.status,
    });
  }

  private handleFetchError(error: unknown, timeout: number): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return LLMError.timeout(this.name, timeout);
      }

      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed")
      ) {
        return LLMError.connectionError(
          this.name,
          this.config.baseUrl,
          error
        );
      }
    }

    return LLMError.fromUnknown(this.name, error);
  }
}
