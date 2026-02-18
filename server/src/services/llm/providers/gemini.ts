/**
 * Google AI (Gemini) LLM Provider
 *
 * Implementation of the LLM provider interface for Google AI Studio.
 * Uses the @google/genai SDK for Gemini model inference.
 */

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
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

export class GeminiProvider implements LLMProvider {
  readonly name = "google";
  private readonly config: LLMConfig;
  private readonly client: GoogleGenAI;

  constructor(config: LLMConfig, apiKey: string) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(
    request: GenerateRequest
  ): Promise<Result<GenerateResponse, LLMError>> {
    const startTime = Date.now();

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: request.prompt,
        config: this.buildConfig({
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          stop: request.stop,
          systemInstruction: request.system,
        }),
      });

      const text = response.text ?? "";
      const usage = this.extractUsage(response.usageMetadata);
      const durationMs = Date.now() - startTime;

      return ok({
        text,
        model: this.config.model,
        usage,
        durationMs,
      });
    } catch (error) {
      return err(this.handleError(error));
    }
  }

  async *generateStream(
    request: GenerateRequest
  ): AsyncGenerator<StreamChunk> {
    try {
      const response = await this.client.models.generateContentStream({
        model: this.config.model,
        contents: request.prompt,
        config: this.buildConfig({
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          stop: request.stop,
          systemInstruction: request.system,
        }),
      });

      for await (const chunk of response) {
        const text = chunk.text ?? "";
        // The SDK doesn't provide a clear "done" signal per chunk,
        // so we yield each chunk as not done and emit a final done chunk after
        yield { text, done: false };
      }

      // Emit a final done chunk
      yield { text: "", done: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async chat(request: ChatRequest): Promise<Result<ChatResponse, LLMError>> {
    const startTime = Date.now();

    try {
      // Separate system messages from conversation messages
      const systemMessages = request.messages.filter((m) => m.role === "system");
      const conversationMessages = request.messages.filter(
        (m) => m.role !== "system"
      );

      const systemInstruction = systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join("\n\n")
        : undefined;

      // Build contents array for multi-turn conversation
      const contents = conversationMessages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents,
        config: this.buildConfig({
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          stop: request.stop,
          systemInstruction,
        }),
      });

      const text = response.text ?? "";
      const usage = this.extractUsage(response.usageMetadata);
      const durationMs = Date.now() - startTime;

      return ok({
        message: { role: "assistant", content: text },
        model: this.config.model,
        usage,
        durationMs,
      });
    } catch (error) {
      return err(this.handleError(error));
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    try {
      const systemMessages = request.messages.filter((m) => m.role === "system");
      const conversationMessages = request.messages.filter(
        (m) => m.role !== "system"
      );

      const systemInstruction = systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join("\n\n")
        : undefined;

      const contents = conversationMessages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

      const response = await this.client.models.generateContentStream({
        model: this.config.model,
        contents,
        config: this.buildConfig({
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          stop: request.stop,
          systemInstruction,
        }),
      });

      for await (const chunk of response) {
        const text = chunk.text ?? "";
        yield { text, done: false };
      }

      yield { text: "", done: true };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: "Say hi",
        config: { maxOutputTokens: 5 },
      });
      return response.text !== undefined;
    } catch {
      return false;
    }
  }

  private buildConfig(options: {
    maxTokens: number | undefined;
    temperature: number | undefined;
    stop: string[] | undefined;
    systemInstruction: string | undefined;
  }): GenerateContentConfig {
    const config: GenerateContentConfig = {
      maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
    };
    if (options.stop) {
      config.stopSequences = options.stop;
    }
    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    return config;
  }

  private extractUsage(
    usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined
  ): TokenUsage | undefined {
    if (!usageMetadata) return undefined;

    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const completionTokens = usageMetadata.candidatesTokenCount ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: usageMetadata.totalTokenCount ?? promptTokens + completionTokens,
    };
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof LLMError) return error;

    if (error instanceof Error) {
      const message = error.message;

      if (message.includes("API key")) {
        return new LLMError(
          `Google AI authentication failed: ${message}`,
          "CONNECTION_ERROR",
          this.name,
          { statusCode: 401, cause: error }
        );
      }

      if (message.includes("429") || message.includes("rate") || message.includes("quota")) {
        return LLMError.rateLimited(this.name);
      }

      if (message.includes("not found") || message.includes("404")) {
        return LLMError.modelNotFound(this.name, this.config.model);
      }

      if (message.includes("context") || message.includes("too long") || message.includes("token")) {
        return LLMError.contextLengthExceeded(this.name, message);
      }

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return LLMError.connectionError(this.name, "https://generativelanguage.googleapis.com", error);
      }
    }

    return LLMError.fromUnknown(this.name, error);
  }
}
