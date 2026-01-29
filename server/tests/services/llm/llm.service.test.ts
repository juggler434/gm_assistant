import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMService, type LLMLogger } from "../../../src/services/llm/llm.service.js";
import type { LLMProvider } from "../../../src/services/llm/providers/provider.interface.js";
import type { LLMConfig, GenerateResponse, ChatResponse } from "../../../src/services/llm/types.js";
import { LLMError } from "../../../src/services/llm/errors.js";
import { ok, err } from "../../../src/types/index.js";

const mockConfig: LLMConfig = {
  model: "llama3",
  baseUrl: "http://localhost:11434",
  timeout: 5000,
  maxTokens: 100,
  temperature: 0.7,
};

function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn(),
    generateStream: vi.fn(),
    chat: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
  };
}

function createMockLogger(): LLMLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("LLMService", () => {
  let service: LLMService;
  let mockProvider: LLMProvider;
  let mockLogger: LLMLogger;

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockLogger = createMockLogger();
    service = new LLMService(mockProvider, mockConfig, { logger: mockLogger });
  });

  describe("properties", () => {
    it("should return provider name", () => {
      expect(service.providerName).toBe("mock");
    });

    it("should return model name", () => {
      expect(service.model).toBe("llama3");
    });
  });

  describe("generate", () => {
    it("should call provider with merged defaults", async () => {
      const mockResponse: GenerateResponse = {
        text: "Hello!",
        model: "llama3",
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      };
      vi.mocked(mockProvider.generate).mockResolvedValueOnce(ok(mockResponse));

      const result = await service.generate({ prompt: "Hi" });

      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: "Hi",
        maxTokens: 100,
        temperature: 0.7,
        timeout: 5000,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe("Hello!");
      }
    });

    it("should use request overrides over defaults", async () => {
      const mockResponse: GenerateResponse = {
        text: "Hello!",
        model: "llama3",
      };
      vi.mocked(mockProvider.generate).mockResolvedValueOnce(ok(mockResponse));

      await service.generate({
        prompt: "Hi",
        maxTokens: 50,
        temperature: 0.3,
        timeout: 10000,
      });

      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: "Hi",
        maxTokens: 50,
        temperature: 0.3,
        timeout: 10000,
      });
    });

    it("should log on success", async () => {
      const mockResponse: GenerateResponse = {
        text: "Hello!",
        model: "llama3",
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      };
      vi.mocked(mockProvider.generate).mockResolvedValueOnce(ok(mockResponse));

      await service.generate({ prompt: "Hi" });

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Generate completed",
        expect.objectContaining({ model: "llama3" })
      );
    });

    it("should log on error", async () => {
      const error = LLMError.timeout("mock", 5000);
      vi.mocked(mockProvider.generate).mockResolvedValueOnce(err(error));

      await service.generate({ prompt: "Hi" });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Generate failed",
        expect.objectContaining({ error: error.toJSON() })
      );
    });
  });

  describe("chat", () => {
    it("should call provider with merged defaults", async () => {
      const mockResponse: ChatResponse = {
        message: { role: "assistant", content: "Hello!" },
        model: "llama3",
      };
      vi.mocked(mockProvider.chat).mockResolvedValueOnce(ok(mockResponse));

      const result = await service.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockProvider.chat).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 100,
        temperature: 0.7,
        timeout: 5000,
      });
      expect(result.ok).toBe(true);
    });

    it("should log message count", async () => {
      const mockResponse: ChatResponse = {
        message: { role: "assistant", content: "Hello!" },
        model: "llama3",
      };
      vi.mocked(mockProvider.chat).mockResolvedValueOnce(ok(mockResponse));

      await service.chat({
        messages: [
          { role: "system", content: "Be helpful" },
          { role: "user", content: "Hi" },
        ],
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Chat request",
        expect.objectContaining({ messageCount: 2 })
      );
    });
  });

  describe("generateStream", () => {
    it("should yield chunks and log completion", async () => {
      const chunks = [
        { text: "Hello", done: false },
        { text: "!", done: true, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      vi.mocked(mockProvider.generateStream).mockReturnValueOnce(mockStream());

      const result: string[] = [];
      for await (const chunk of service.generateStream({ prompt: "Hi" })) {
        result.push(chunk.text);
      }

      expect(result).toEqual(["Hello", "!"]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Generate stream completed",
        expect.objectContaining({ totalChunks: 2 })
      );
    });

    it("should log error on stream failure", async () => {
      const error = new LLMError("Stream error", "UNKNOWN", "mock");

      async function* mockStream() {
        throw error;
      }

      vi.mocked(mockProvider.generateStream).mockReturnValueOnce(mockStream());

      await expect(async () => {
        for await (const _chunk of service.generateStream({ prompt: "Hi" })) {
          // Should throw
        }
      }).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Generate stream failed",
        expect.objectContaining({ error: "Stream error" })
      );
    });
  });

  describe("chatStream", () => {
    it("should yield chunks from provider", async () => {
      const chunks = [
        { text: "Hi", done: false },
        { text: " there", done: true },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      vi.mocked(mockProvider.chatStream).mockReturnValueOnce(mockStream());

      const result: string[] = [];
      for await (const chunk of service.chatStream({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        result.push(chunk.text);
      }

      expect(result).toEqual(["Hi", " there"]);
    });
  });

  describe("healthCheck", () => {
    it("should delegate to provider", async () => {
      vi.mocked(mockProvider.healthCheck).mockResolvedValueOnce(true);

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockProvider.healthCheck).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Health check",
        expect.objectContaining({ healthy: true })
      );
    });

    it("should return false when provider is unhealthy", async () => {
      vi.mocked(mockProvider.healthCheck).mockResolvedValueOnce(false);

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });
});
