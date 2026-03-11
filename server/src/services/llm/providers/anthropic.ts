/**
 * Anthropic LLM Provider
 *
 * Implementation of the LLM provider interface for the Anthropic API (Claude models).
 * Uses the @anthropic-ai/sdk package.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ok, err, type Result } from "@/types/index.js";
import { LLMError } from "../errors.js";
import type { LLMProvider } from "./interface.js";
import type {
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMConfig,
  TokenUsage,
} from "../types.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly config: LLMConfig;
  private readonly client: Anthropic;

  constructor(config: LLMConfig, apiKey: string) {
    this.config = config;
    this.client = new Anthropic({
      apiKey,
      timeout: config.timeout,
    });
  }

  async generate(
    request: GenerateRequest
  ): Promise<Result<GenerateResponse, LLMError>> {
    // Anthropic only has a messages API, so we convert the prompt to a single user message
    const result = await this.chat(toChatRequest(request));
    if (!result.ok) return result;

    return ok({
      text: result.value.message.content,
      model: result.value.model,
      usage: result.value.usage,
      durationMs: result.value.durationMs,
    });
  }

  async *generateStream(
    request: GenerateRequest
  ): AsyncGenerator<StreamChunk> {
    yield* this.chatStream(toChatRequest(request));
  }

  async chat(request: ChatRequest): Promise<Result<ChatResponse, LLMError>> {
    const startTime = Date.now();

    try {
      const systemMessages = request.messages.filter(
        (m) => m.role === "system"
      );
      const conversationMessages = request.messages.filter(
        (m) => m.role !== "system"
      );

      const systemText =
        systemMessages.length > 0
          ? systemMessages.map((m) => m.content).join("\n\n")
          : undefined;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        ...(systemText ? { system: systemText } : {}),
        ...(request.stop ? { stop_sequences: request.stop } : {}),
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      const usage = this.extractUsage(response.usage);
      const durationMs = Date.now() - startTime;

      return ok({
        message: { role: "assistant", content: text },
        model: response.model,
        usage,
        durationMs,
      });
    } catch (error) {
      return err(this.handleError(error));
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    try {
      const systemMessages = request.messages.filter(
        (m) => m.role === "system"
      );
      const conversationMessages = request.messages.filter(
        (m) => m.role !== "system"
      );

      const systemText =
        systemMessages.length > 0
          ? systemMessages.map((m) => m.content).join("\n\n")
          : undefined;

      const stream = this.client.messages.stream({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        ...(systemText ? { system: systemText } : {}),
        ...(request.stop ? { stop_sequences: request.stop } : {}),
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { text: event.delta.text, done: false };
        }
      }

      const finalMessage = await stream.finalMessage();
      const usage = this.extractUsage(finalMessage.usage);
      yield { text: "", done: true, usage };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 5,
        messages: [{ role: "user", content: "Say hi" }],
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  private extractUsage(
    usage:
      | { input_tokens: number; output_tokens: number }
      | undefined
  ): TokenUsage | undefined {
    if (!usage) return undefined;

    return {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens,
    };
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof LLMError) return error;

    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        return new LLMError(
          `Anthropic authentication failed: ${error.message}`,
          "CONNECTION_ERROR",
          this.name,
          { statusCode: 401, cause: error }
        );
      }

      if (error.status === 429) {
        return LLMError.rateLimited(this.name);
      }

      if (error.status === 404) {
        return LLMError.modelNotFound(this.name, this.config.model);
      }

      if (
        error.status === 400 &&
        error.message.includes("context")
      ) {
        return LLMError.contextLengthExceeded(this.name, error.message);
      }

      return new LLMError(
        `Anthropic API error: ${error.message}`,
        "UNKNOWN",
        this.name,
        { statusCode: error.status, cause: error }
      );
    }

    if (error instanceof Anthropic.APIConnectionError) {
      return LLMError.connectionError(
        this.name,
        "https://api.anthropic.com",
        error
      );
    }

    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return LLMError.timeout(this.name, this.config.timeout);
    }

    return LLMError.fromUnknown(this.name, error);
  }
}

/** Convert a GenerateRequest to a ChatRequest for the messages API. */
function toChatRequest(request: GenerateRequest): ChatRequest {
  const messages = [
    ...(request.system
      ? [{ role: "system" as const, content: request.system }]
      : []),
    { role: "user" as const, content: request.prompt },
  ];

  const chatRequest: ChatRequest = { messages };
  if (request.maxTokens !== undefined) chatRequest.maxTokens = request.maxTokens;
  if (request.temperature !== undefined) chatRequest.temperature = request.temperature;
  if (request.stop !== undefined) chatRequest.stop = request.stop;
  if (request.timeout !== undefined) chatRequest.timeout = request.timeout;
  return chatRequest;
}
