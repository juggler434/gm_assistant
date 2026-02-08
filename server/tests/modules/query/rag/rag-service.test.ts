import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions
const { mockSearchChunksHybrid, mockFetch } = vi.hoisted(() => ({
  mockSearchChunksHybrid: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/modules/knowledge/retrieval/hybrid-search.js", () => ({
  searchChunksHybrid: mockSearchChunksHybrid,
}));

vi.mock("@/config/index.js", () => ({
  config: {
    llm: {
      baseUrl: "http://localhost:11434",
      model: "llama3",
      timeout: 30000,
      maxTokens: 2048,
      temperature: 0.7,
    },
  },
}));

// Mock global fetch for embedding calls
vi.stubGlobal("fetch", mockFetch);

import { executeRAGPipeline, type RAGQuery } from "@/modules/query/rag/rag.service.js";
import type { LLMService } from "@/services/llm/service.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";

const mockChat = vi.fn();

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

function makeHybridResult(
  id: string,
  content: string,
  score: number,
  docName = "Monster Manual",
): HybridSearchResult {
  return {
    chunk: {
      id,
      content,
      chunkIndex: 0,
      tokenCount: 10,
      pageNumber: 1,
      section: "Monsters",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    },
    score,
    vectorScore: score,
    keywordScore: score * 0.8,
    document: {
      id: "doc-001",
      name: docName,
      documentType: "rulebook" as const,
      metadata: {},
    },
  };
}

function mockEmbeddingResponse(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ embeddings: [Array(768).fill(0.1)] }),
    text: async () => "",
  });
}

describe("RAG Service", () => {
  const campaignId = "campaign-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeRAGPipeline", () => {
    it("should execute the full pipeline and return an answer with sources", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "What does the dragon do?", campaignId };

      // Mock embedding
      mockEmbeddingResponse();

      // Mock search
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [
          makeHybridResult("c1", "The dragon breathes fire.", 0.9),
          makeHybridResult("c2", "Dragons hoard treasure.", 0.75),
        ],
      });

      // Mock LLM
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: {
            role: "assistant",
            content: "The dragon breathes fire [1] and hoards treasure [2].",
          },
          model: "llama3",
          usage: { promptTokens: 200, completionTokens: 30, totalTokens: 230 },
        },
      });

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.answer).toContain("dragon breathes fire");
        expect(result.value.sources).toHaveLength(2);
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.isUnanswerable).toBe(false);
        expect(result.value.chunksRetrieved).toBe(2);
        expect(result.value.chunksUsed).toBe(2);
        expect(result.value.usage).toBeDefined();
      }
    });

    it("should reject empty questions", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "   ", campaignId };

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_QUERY");
      }
    });

    it("should return error when embedding fails", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "What is a goblin?", campaignId };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMBEDDING_FAILED");
      }
    });

    it("should return error when search fails", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "What is a goblin?", campaignId };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", message: "Connection lost" },
      });

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SEARCH_FAILED");
      }
    });

    it("should return error when LLM generation fails", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "What is a goblin?", campaignId };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Goblins are small creatures.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: false,
        error: { message: "Model not found", code: "MODEL_NOT_FOUND" },
      });

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GENERATION_FAILED");
      }
    });

    it("should handle no search results gracefully", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "What about unicorns?", campaignId };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: {
            role: "assistant",
            content: "I don't have enough information about unicorns in the campaign documents.",
          },
          model: "llama3",
        },
      });

      const result = await executeRAGPipeline(query, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.chunksRetrieved).toBe(0);
        expect(result.value.chunksUsed).toBe(0);
        expect(result.value.isUnanswerable).toBe(true);
        expect(result.value.sources).toHaveLength(0);
      }
    });

    it("should pass filter options through to hybrid search", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = {
        question: "What is a goblin?",
        campaignId,
        documentIds: ["doc-001", "doc-002"],
        documentTypes: ["rulebook", "notes"],
        maxChunks: 5,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "No info found." },
          model: "llama3",
        },
      });

      await executeRAGPipeline(query, llm);

      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        "What is a goblin?",
        expect.any(Array),
        campaignId,
        expect.objectContaining({
          limit: 5,
          documentIds: ["doc-001", "doc-002"],
          documentTypes: ["rulebook", "notes"],
        }),
      );
    });

    it("should call embedding API with correct model and input", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "Tell me about elves", campaignId };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "No info." },
          model: "llama3",
        },
      });

      await executeRAGPipeline(query, llm);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/embed",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            model: "nomic-embed-text",
            input: ["Tell me about elves"],
          }),
        }),
      );
    });

    it("should trim the question before processing", async () => {
      const llm = makeMockLLMService();
      const query: RAGQuery = { question: "  What about dwarves?  ", campaignId };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "No info." },
          model: "llama3",
        },
      });

      await executeRAGPipeline(query, llm);

      // Should use trimmed question for search
      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        "What about dwarves?",
        expect.any(Array),
        campaignId,
        expect.any(Object),
      );
    });
  });
});
