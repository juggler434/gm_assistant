// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeConfidence } from "@/modules/query/rag/response-generator.js";
import type { SourceCitation } from "@/modules/query/rag/types.js";

// Hoist mock functions
const { mockChat } = vi.hoisted(() => ({
  mockChat: vi.fn(),
}));

vi.mock("@/services/llm/service.js", () => ({
  LLMService: vi.fn(),
}));

import { generateResponse } from "@/modules/query/rag/response-generator.js";
import type { BuiltContext } from "@/modules/query/rag/types.js";
import type { LLMService } from "@/services/llm/service.js";

function makeMockLLMService(): LLMService {
  return {
    chat: mockChat,
    generate: vi.fn(),
    generateStream: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
    providerName: "ollama",
    model: "llama3",
  } as unknown as LLMService;
}

function makeContext(overrides: Partial<BuiltContext> = {}): BuiltContext {
  return {
    contextText: overrides.contextText ?? "[1] Monster Manual - Monsters (p. 1)\nThe dragon breathes fire.",
    sources: overrides.sources ?? [
      {
        index: 1,
        documentName: "Monster Manual",
        documentId: "doc-001",
        documentType: "rulebook",
        pageNumber: 1,
        section: "Monsters",
        relevanceScore: 0.85,
      },
    ],
    chunksUsed: overrides.chunksUsed ?? 1,
    estimatedTokens: overrides.estimatedTokens ?? 50,
  };
}

describe("Response Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeConfidence", () => {
    it("should return low confidence when no sources are available", () => {
      const confidence = computeConfidence([], "Some answer");
      expect(confidence).toBe(0.1);
    });

    it("should return low confidence for unanswerable responses", () => {
      const sources: SourceCitation[] = [
        {
          index: 1,
          documentName: "Doc",
          documentId: "d1",
          documentType: "notes",
          pageNumber: null,
          section: null,
          relevanceScore: 0.9,
        },
      ];
      const confidence = computeConfidence(
        sources,
        "I don't have enough information to answer that question.",
      );
      expect(confidence).toBe(0.15);
    });

    it("should return higher confidence with high relevance and multiple sources", () => {
      const sources: SourceCitation[] = [
        { index: 1, documentName: "A", documentId: "d1", documentType: "rulebook", pageNumber: 1, section: null, relevanceScore: 0.95 },
        { index: 2, documentName: "B", documentId: "d2", documentType: "notes", pageNumber: null, section: null, relevanceScore: 0.85 },
        { index: 3, documentName: "C", documentId: "d3", documentType: "setting", pageNumber: null, section: null, relevanceScore: 0.75 },
      ];
      const confidence = computeConfidence(sources, "The dragon is a fearsome creature.");

      // topScore * 0.5 + avgRelevance * 0.3 + sourceBoost + 0.05
      // 0.95 * 0.5 + 0.85 * 0.3 + 0.10 + 0.05 = 0.475 + 0.255 + 0.10 + 0.05 = 0.88
      expect(confidence).toBeCloseTo(0.88, 1);
      expect(confidence).toBeGreaterThan(0.5);
    });

    it("should cap confidence at 1.0", () => {
      const sources: SourceCitation[] = [
        { index: 1, documentName: "A", documentId: "d1", documentType: "rulebook", pageNumber: null, section: null, relevanceScore: 1.0 },
        { index: 2, documentName: "B", documentId: "d2", documentType: "rulebook", pageNumber: null, section: null, relevanceScore: 1.0 },
        { index: 3, documentName: "C", documentId: "d3", documentType: "rulebook", pageNumber: null, section: null, relevanceScore: 1.0 },
        { index: 4, documentName: "D", documentId: "d4", documentType: "rulebook", pageNumber: null, section: null, relevanceScore: 1.0 },
      ];
      const confidence = computeConfidence(sources, "Definitive answer.");

      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it("should give moderate confidence with a single average source", () => {
      const sources: SourceCitation[] = [
        { index: 1, documentName: "A", documentId: "d1", documentType: "notes", pageNumber: null, section: null, relevanceScore: 0.5 },
      ];
      const confidence = computeConfidence(sources, "The answer is...");

      // 0.5 * 0.5 + 0.5 * 0.3 + 0 + 0.05 = 0.25 + 0.15 + 0.05 = 0.45
      expect(confidence).toBeCloseTo(0.45, 1);
    });
  });

  describe("generateResponse", () => {
    it("should generate an answer from LLM with sources", async () => {
      const llm = makeMockLLMService();
      const context = makeContext();

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "The dragon breathes fire [1]." },
          model: "llama3",
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        },
      });

      const result = await generateResponse("What does the dragon do?", context, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.answer).toBe("The dragon breathes fire [1].");
        expect(result.value.sources).toHaveLength(1);
        expect(result.value.sources[0]?.documentName).toBe("Monster Manual");
        expect(result.value.isUnanswerable).toBe(false);
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.usage).toEqual({
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        });
      }
    });

    it("should detect unanswerable responses", async () => {
      const llm = makeMockLLMService();
      const context = makeContext();

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: {
            role: "assistant",
            content: "I don't have enough information to answer this question based on the provided context.",
          },
          model: "llama3",
        },
      });

      const result = await generateResponse("What is the weather?", context, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isUnanswerable).toBe(true);
        expect(result.value.confidence).toBeLessThan(0.3);
      }
    });

    it("should return error when LLM fails", async () => {
      const llm = makeMockLLMService();
      const context = makeContext();

      mockChat.mockResolvedValue({
        ok: false,
        error: { message: "Connection refused", code: "CONNECTION_ERROR" },
      });

      const result = await generateResponse("What does the dragon do?", context, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("LLM_ERROR");
        expect(result.error.message).toContain("Connection refused");
      }
    });

    it("should handle empty context gracefully", async () => {
      const llm = makeMockLLMService();
      const context = makeContext({
        contextText: "",
        sources: [],
        chunksUsed: 0,
        estimatedTokens: 0,
      });

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: {
            role: "assistant",
            content: "I don't have enough information. No relevant context was found.",
          },
          model: "llama3",
        },
      });

      const result = await generateResponse("Tell me about orcs.", context, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sources).toHaveLength(0);
        expect(result.value.isUnanswerable).toBe(true);
      }
    });

    it("should pass system and user messages to LLM chat", async () => {
      const llm = makeMockLLMService();
      const context = makeContext();

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "Answer here." },
          model: "llama3",
        },
      });

      await generateResponse("My question", context, llm);

      expect(mockChat).toHaveBeenCalledTimes(1);
      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].content).toContain("My question");
      expect(callArgs.messages[1].content).toContain("SOURCE TEXT:");
      expect(callArgs.temperature).toBe(0);
    });
  });
});
