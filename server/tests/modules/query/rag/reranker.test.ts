// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions
const { mockChat } = vi.hoisted(() => ({
  mockChat: vi.fn(),
}));

vi.mock("@/services/llm/service.js", () => ({
  LLMService: vi.fn(),
}));

import { rerankChunks } from "@/modules/query/rag/reranker.js";
import type { LLMService } from "@/services/llm/service.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";
import { LLMError } from "@/services/llm/errors.js";

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

function makeChunk(overrides: Partial<HybridSearchResult> & { id?: string; content?: string; score?: number }): HybridSearchResult {
  return {
    chunk: {
      id: overrides.id ?? "chunk-1",
      content: overrides.content ?? "Some chunk content",
      chunkIndex: 0,
      tokenCount: 50,
      pageNumber: null,
      section: null,
      createdAt: new Date(),
    },
    score: overrides.score ?? 0.8,
    vectorScore: 0.7,
    keywordScore: 0.5,
    document: {
      id: "doc-1",
      name: "Test Document",
      documentType: "other",
      metadata: {},
    },
    ...overrides,
  } as HybridSearchResult;
}

describe("LLM Re-ranker", () => {
  let llmService: LLMService;

  beforeEach(() => {
    vi.clearAllMocks();
    llmService = makeMockLLMService();
  });

  it("should re-rank and reorder chunks based on LLM scores", async () => {
    const chunks = [
      makeChunk({ id: "chunk-1", content: "Dragons breathe fire", score: 0.9 }),
      makeChunk({ id: "chunk-2", content: "Dragon weaknesses include cold", score: 0.7 }),
      makeChunk({ id: "chunk-3", content: "Tavern menu prices", score: 0.6 }),
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: {
          role: "assistant",
          content: JSON.stringify([
            { index: 1, score: 6 },
            { index: 2, score: 9 },
            { index: 3, score: 4 },
          ]),
        },
        model: "llama3",
      },
    });

    const result = await rerankChunks("What are dragon weaknesses?", chunks, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
      // Reordered: chunk-2 (0.9) > chunk-1 (0.6) > chunk-3 (0.4)
      expect(result.value[0].chunk.id).toBe("chunk-2");
      expect(result.value[0].score).toBe(0.9);
      expect(result.value[1].chunk.id).toBe("chunk-1");
      expect(result.value[1].score).toBe(0.6);
      expect(result.value[2].chunk.id).toBe("chunk-3");
      expect(result.value[2].score).toBe(0.4);
    }

    expect(mockChat).toHaveBeenCalledOnce();
    const chatCall = mockChat.mock.calls[0][0];
    expect(chatCall.temperature).toBe(0.1);
    expect(chatCall.maxTokens).toBe(500);
    expect(chatCall.messages[0].role).toBe("system");
    expect(chatCall.messages[1].content).toContain("What are dragon weaknesses?");
    expect(chatCall.messages[1].content).toContain("[1]");
    expect(chatCall.messages[1].content).toContain("[2]");
  });

  it("should filter out low-scoring chunks", async () => {
    const chunks = [
      makeChunk({ id: "chunk-1", content: "Relevant content", score: 0.9 }),
      makeChunk({ id: "chunk-2", content: "Irrelevant content", score: 0.7 }),
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: {
          role: "assistant",
          content: JSON.stringify([
            { index: 1, score: 8 },
            { index: 2, score: 2 }, // Below 0.3 threshold (2/10 = 0.2)
          ]),
        },
        model: "llama3",
      },
    });

    const result = await rerankChunks("Tell me about the quest", chunks, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].chunk.id).toBe("chunk-1");
      expect(result.value[0].score).toBe(0.8);
    }
  });

  it("should fall back to original chunks on LLM error", async () => {
    const chunks = [
      makeChunk({ id: "chunk-1", score: 0.9 }),
      makeChunk({ id: "chunk-2", score: 0.7 }),
    ];

    mockChat.mockResolvedValue({
      ok: false,
      error: new LLMError("Connection refused", "CONNECTION_ERROR", "ollama"),
    });

    const result = await rerankChunks("What is this?", chunks, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Returns original chunks unchanged
      expect(result.value).toHaveLength(2);
      expect(result.value[0].score).toBe(0.9);
      expect(result.value[1].score).toBe(0.7);
    }
  });

  it("should fall back to original chunks on malformed JSON response", async () => {
    const chunks = [
      makeChunk({ id: "chunk-1", score: 0.8 }),
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: {
          role: "assistant",
          content: "I cannot parse this as valid JSON [{broken",
        },
        model: "llama3",
      },
    });

    const result = await rerankChunks("What is this?", chunks, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].score).toBe(0.8);
    }
  });

  it("should return empty array when given empty input", async () => {
    const result = await rerankChunks("What is this?", [], llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("should fall back to original chunks when response is not an array", async () => {
    const chunks = [
      makeChunk({ id: "chunk-1", score: 0.8 }),
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: {
          role: "assistant",
          content: JSON.stringify({ index: 1, score: 8 }),
        },
        model: "llama3",
      },
    });

    const result = await rerankChunks("What is this?", chunks, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].score).toBe(0.8);
    }
  });
});
