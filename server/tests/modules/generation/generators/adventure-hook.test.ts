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

import { generateAdventureHooks } from "@/modules/generation/generators/adventure-hook.js";
import type { AdventureHookRequest } from "@/modules/generation/types.js";
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
  docName = "Setting Guide",
): HybridSearchResult {
  return {
    chunk: {
      id,
      content,
      chunkIndex: 0,
      tokenCount: 10,
      pageNumber: 3,
      section: "World Lore",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    },
    score,
    vectorScore: score,
    keywordScore: score * 0.8,
    document: {
      id: "doc-001",
      name: docName,
      documentType: "setting" as const,
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

function makeValidHooksJSON(count = 3): string {
  const hooks = Array.from({ length: count }, (_, i) => ({
    title: `Hook ${i + 1}`,
    description: `Adventure hook ${i + 1} involving danger and intrigue.`,
    npcs: [`NPC ${i + 1}`],
    locations: [`Location ${i + 1}`],
    factions: [`Faction ${i + 1}`],
  }));
  return JSON.stringify({ hooks });
}

describe("Adventure Hook Generator", () => {
  const campaignId = "campaign-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateAdventureHooks", () => {
    it("should generate hooks with setting context and sources", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [
          makeHybridResult("c1", "The Shadowfang clan rules the northern wastes.", 0.9),
          makeHybridResult("c2", "Lord Drayven commands a legion of undead.", 0.75),
        ],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(4) },
          model: "llama3",
          usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks).toHaveLength(4);
        expect(result.value.hooks[0]).toHaveProperty("title");
        expect(result.value.hooks[0]).toHaveProperty("description");
        expect(result.value.hooks[0]).toHaveProperty("npcs");
        expect(result.value.hooks[0]).toHaveProperty("locations");
        expect(result.value.hooks[0]).toHaveProperty("factions");
        expect(result.value.sources).toHaveLength(2);
        expect(result.value.sources[0]?.documentName).toBe("Setting Guide");
        expect(result.value.chunksUsed).toBe(2);
        expect(result.value.usage).toEqual({
          promptTokens: 500,
          completionTokens: 300,
          totalTokens: 800,
        });
      }
    });

    it("should reject party level below 1", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "heroic",
        partyLevel: 0,
      };

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_REQUEST");
        expect(result.error.message).toContain("Party level");
      }
    });

    it("should reject party level above 20", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "heroic",
        partyLevel: 21,
      };

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_REQUEST");
      }
    });

    it("should return error when embedding fails", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMBEDDING_FAILED");
      }
    });

    it("should return error when hybrid search fails", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "mysterious" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", message: "Connection lost" },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SEARCH_FAILED");
        expect(result.error.message).toContain("Connection lost");
      }
    });

    it("should return error when LLM generation fails", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "comedic" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "The Jolly Jester tavern is known for pranks.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: false,
        error: { message: "Model not found", code: "MODEL_NOT_FOUND" },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GENERATION_FAILED");
        expect(result.error.message).toContain("Model not found");
      }
    });

    it("should return error when LLM returns invalid JSON", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Some setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "This is not valid JSON at all" },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("should return error when LLM returns JSON without hooks array", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Some setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"adventures": []}' },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("hooks");
      }
    });

    it("should handle LLM response wrapped in markdown code fencing", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting details.", 0.8)],
      });

      const jsonContent = makeValidHooksJSON(3);
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "```json\n" + jsonContent + "\n```" },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks).toHaveLength(3);
      }
    });

    it("should handle empty search results gracefully", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "heroic" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks).toHaveLength(3);
        expect(result.value.sources).toHaveLength(0);
        expect(result.value.chunksUsed).toBe(0);
      }
    });

    it("should search with setting and notes document types", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        campaignId,
        expect.objectContaining({
          documentTypes: ["setting", "notes"],
        }),
      );
    });

    it("should use creative temperature for LLM generation", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting details.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      expect(mockChat).toHaveBeenCalledTimes(1);
      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.temperature).toBe(0.8);
    });

    it("should pass system and user messages to LLM", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "political" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "The Council of Elders governs the realm.", 0.85)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].content).toContain("Tone: political");
    });

    it("should include theme in prompt when provided", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "dark",
        theme: "vampire conspiracy",
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[1].content).toContain("Theme: vampire conspiracy");
    });

    it("should include requested count in system prompt when provided", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "dark",
        count: 8,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Generate exactly 8 adventure hooks.");
    });

    it("should include party level in prompt when provided", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "heroic",
        partyLevel: 12,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[1].content).toContain("Party level: 12");
    });

    it("should call embedding API with correct model", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/embed",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("nomic-embed-text"),
        }),
      );
    });

    it("should respect custom maxContextChunks", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = {
        campaignId,
        tone: "dark",
        maxContextChunks: 3,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      await generateAdventureHooks(request, llm);

      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        campaignId,
        expect.objectContaining({ limit: 3 }),
      );
    });

    it("should handle hooks with missing optional fields gracefully", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      const incompleteJSON = JSON.stringify({
        hooks: [
          {
            title: "Mysterious Disappearance",
            description: "People have been vanishing.",
          },
        ],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: incompleteJSON },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks).toHaveLength(1);
        expect(result.value.hooks[0]?.title).toBe("Mysterious Disappearance");
        expect(result.value.hooks[0]?.npcs).toEqual([]);
        expect(result.value.hooks[0]?.locations).toEqual([]);
        expect(result.value.hooks[0]?.factions).toEqual([]);
      }
    });

    it("should return parse error when hooks array is empty", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"hooks": []}' },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("no valid hooks");
      }
    });

    it("should not include usage when LLM does not return it", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidHooksJSON(3) },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeUndefined();
      }
    });

    it("should filter non-string values from npcs/locations/factions arrays", async () => {
      const llm = makeMockLLMService();
      const request: AdventureHookRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      const mixedJSON = JSON.stringify({
        hooks: [
          {
            title: "The Dark Ritual",
            description: "A sinister ritual threatens the land.",
            npcs: ["Valid NPC", 42, null, "Another NPC"],
            locations: ["Valid Location", false],
            factions: [123, "Valid Faction"],
          },
        ],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: mixedJSON },
          model: "llama3",
        },
      });

      const result = await generateAdventureHooks(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hooks[0]?.npcs).toEqual(["Valid NPC", "Another NPC"]);
        expect(result.value.hooks[0]?.locations).toEqual(["Valid Location"]);
        expect(result.value.hooks[0]?.factions).toEqual(["Valid Faction"]);
      }
    });
  });
});
