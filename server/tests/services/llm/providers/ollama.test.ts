// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../../../../src/services/llm/providers/ollama.js";
import type { LLMConfig } from "../../../../src/services/llm/types.js";

const mockConfig: LLMConfig = {
  model: "llama3",
  baseUrl: "http://localhost:11434",
  timeout: 5000,
  maxTokens: 100,
  temperature: 0.7,
};

describe("OllamaProvider", () => {
  let provider: OllamaProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new OllamaProvider(mockConfig);
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generate", () => {
    it("should return success result on valid response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          response: "Hello, world!",
          done: true,
          total_duration: 1000000000,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      const result = await provider.generate({ prompt: "Hi" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe("Hello, world!");
        expect(result.value.model).toBe("llama3");
        expect(result.value.usage).toEqual({
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        });
      }
    });

    it("should send correct request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3",
          response: "test",
          done: true,
        }),
      });

      await provider.generate({
        prompt: "Hello",
        system: "You are helpful",
        maxTokens: 50,
        temperature: 0.5,
        stop: ["END"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/generate",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3",
            prompt: "Hello",
            system: "You are helpful",
            stream: false,
            options: {
              num_predict: 50,
              temperature: 0.5,
              stop: ["END"],
            },
          }),
        })
      );
    });

    it("should return error on 404 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "model not found" }),
      });

      const result = await provider.generate({ prompt: "Hi" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("MODEL_NOT_FOUND");
      }
    });

    it("should return error on 429 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: "rate limited" }),
      });

      const result = await provider.generate({ prompt: "Hi" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RATE_LIMITED");
      }
    });

    it("should return timeout error on abort", async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      });

      const result = await provider.generate({ prompt: "Hi" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TIMEOUT");
      }
    });

    it("should return connection error on fetch failure", async () => {
      mockFetch.mockImplementationOnce(() => {
        throw new Error("fetch failed");
      });

      const result = await provider.generate({ prompt: "Hi" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CONNECTION_ERROR");
      }
    });
  });

  describe("chat", () => {
    it("should return success result on valid response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "Hello!" },
          done: true,
          total_duration: 1000000000,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      const result = await provider.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message.role).toBe("assistant");
        expect(result.value.message.content).toBe("Hello!");
        expect(result.value.model).toBe("llama3");
      }
    });

    it("should send correct request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3",
          message: { role: "assistant", content: "test" },
          done: true,
        }),
      });

      await provider.chat({
        messages: [
          { role: "system", content: "Be helpful" },
          { role: "user", content: "Hello" },
        ],
        maxTokens: 50,
        temperature: 0.5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/chat",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            model: "llama3",
            messages: [
              { role: "system", content: "Be helpful" },
              { role: "user", content: "Hello" },
            ],
            stream: false,
            options: {
              num_predict: 50,
              temperature: 0.5,
              stop: undefined,
            },
          }),
        })
      );
    });
  });

  describe("generateStream", () => {
    it("should yield chunks from stream", async () => {
      const chunks = [
        '{"model":"llama3","response":"Hello","done":false}\n',
        '{"model":"llama3","response":" world","done":false}\n',
        '{"model":"llama3","response":"!","done":true,"prompt_eval_count":5,"eval_count":3}\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream({ prompt: "Hi" })) {
        result.push(chunk.text);
        if (chunk.done) {
          expect(chunk.usage).toEqual({
            promptTokens: 5,
            completionTokens: 3,
            totalTokens: 8,
          });
        }
      }

      expect(result).toEqual(["Hello", " world", "!"]);
    });

    it("should throw on error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "model not found" }),
      });

      await expect(async () => {
        for await (const _chunk of provider.generateStream({ prompt: "Hi" })) {
          // Should not reach here
        }
      }).rejects.toThrow();
    });
  });

  describe("chatStream", () => {
    it("should yield chunks from stream", async () => {
      const chunks = [
        '{"model":"llama3","message":{"role":"assistant","content":"Hi"},"done":false}\n',
        '{"model":"llama3","message":{"role":"assistant","content":" there"},"done":false}\n',
        '{"model":"llama3","message":{"role":"assistant","content":"!"},"done":true,"prompt_eval_count":5,"eval_count":3}\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result: string[] = [];
      for await (const chunk of provider.chatStream({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        result.push(chunk.text);
      }

      expect(result).toEqual(["Hi", " there", "!"]);
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is healthy", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should return false when API returns error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it("should return false when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });
});
