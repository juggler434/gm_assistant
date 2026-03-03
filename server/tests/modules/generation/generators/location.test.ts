// SPDX-License-Identifier: AGPL-3.0-or-later

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

import { generateLocations } from "@/modules/generation/generators/location.js";
import type { LocationGenerationRequest } from "@/modules/generation/types.js";
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
  documentType: "setting" | "notes" | "rulebook" = "setting",
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
      documentType,
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

function makeValidLocationsJSON(count = 2): string {
  const locations = Array.from({ length: count }, (_, i) => ({
    name: `Location ${i + 1}`,
    terrain: "forest",
    climate: "temperate",
    size: "medium",
    readAloud: "The ancient trees tower above you, their gnarled branches forming a canopy that blocks most of the sunlight. A narrow path winds through the undergrowth.",
    keyFeatures: ["Ancient oak tree", "Moss-covered standing stones"],
    pointsOfInterest: ["The Whispering Well", "Ruined watchtower"],
    sensoryDetails: {
      sights: "Dappled sunlight filters through dense canopy",
      sounds: "Birdsong and distant rushing water",
      smells: "Damp earth and wildflowers",
    },
    encounters: ["A wounded traveler seeks aid", "Wild wolves guard their den"],
    secrets: ["A hidden cache beneath the standing stones"],
    npcsPresent: ["Old Marta, the hermit herbalist"],
    factions: ["The Greenward Rangers"],
  }));
  return JSON.stringify({ locations });
}

describe("Location Generator", () => {
  const campaignId = "campaign-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateLocations", () => {
    it("should generate locations with setting context and sources", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [
          makeHybridResult("c1", "The Darkwood Forest stretches for miles.", 0.9),
          makeHybridResult("c2", "The ruins of Thornhold castle sit atop a cliff.", 0.75),
        ],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(3) },
          model: "llama3",
          usage: { promptTokens: 500, completionTokens: 600, totalTokens: 1100 },
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.locations).toHaveLength(3);
        expect(result.value.locations[0]).toHaveProperty("name");
        expect(result.value.locations[0]).toHaveProperty("readAloud");
        expect(result.value.locations[0]).toHaveProperty("keyFeatures");
        expect(result.value.locations[0]).toHaveProperty("pointsOfInterest");
        expect(result.value.locations[0]).toHaveProperty("sensoryDetails");
        expect(result.value.locations[0]?.sensoryDetails).toHaveProperty("sights");
        expect(result.value.locations[0]?.sensoryDetails).toHaveProperty("sounds");
        expect(result.value.locations[0]?.sensoryDetails).toHaveProperty("smells");
        expect(result.value.locations[0]).toHaveProperty("encounters");
        expect(result.value.locations[0]).toHaveProperty("secrets");
        expect(result.value.locations[0]).toHaveProperty("npcsPresent");
        expect(result.value.locations[0]).toHaveProperty("factions");
        expect(result.value.sources).toHaveLength(2);
        expect(result.value.chunksUsed).toBe(2);
        expect(result.value.usage).toEqual({
          promptTokens: 500,
          completionTokens: 600,
          totalTokens: 1100,
        });
      }
    });

    it("should return error when embedding fails", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMBEDDING_FAILED");
      }
    });

    it("should return error when hybrid search fails", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "mysterious" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", message: "Connection lost" },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SEARCH_FAILED");
        expect(result.error.message).toContain("Connection lost");
      }
    });

    it("should return error when LLM generation fails", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "peaceful" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "The meadow stretches endlessly.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: false,
        error: { message: "Model not found", code: "MODEL_NOT_FOUND" },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GENERATION_FAILED");
      }
    });

    it("should return error when LLM returns invalid JSON", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "Not JSON at all" },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("should return error when response missing locations array", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"places": []}' },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("locations");
      }
    });

    it("should handle markdown code fencing", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });

      const jsonContent = makeValidLocationsJSON(2);
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "```json\n" + jsonContent + "\n```" },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.locations).toHaveLength(2);
      }
    });

    it("should handle empty search results gracefully", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "bustling" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.locations).toHaveLength(2);
        expect(result.value.sources).toHaveLength(0);
        expect(result.value.chunksUsed).toBe(0);
      }
    });

    it("should search with setting and notes document types", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        campaignId,
        expect.objectContaining({
          documentTypes: ["setting", "notes"],
        }),
      );
    });

    it("should use creative temperature for generation", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.temperature).toBe(0.8);
    });

    it("should include terrain in prompt when specified", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = {
        campaignId,
        tone: "mysterious",
        terrain: "swamp",
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("swamp");
    });

    it("should include climate in prompt when specified", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = {
        campaignId,
        tone: "dark",
        climate: "frozen tundra",
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("frozen tundra");
    });

    it("should include count in system prompt when provided", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = {
        campaignId,
        tone: "dark",
        count: 4,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Generate exactly 4 locations.");
    });

    it("should handle locations with missing optional fields gracefully", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      const incompleteJSON = JSON.stringify({
        locations: [{ name: "The Unknown Place" }],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: incompleteJSON },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.locations).toHaveLength(1);
        expect(result.value.locations[0]?.name).toBe("The Unknown Place");
        expect(result.value.locations[0]?.terrain).toBe("");
        expect(result.value.locations[0]?.readAloud).toBe("");
        expect(result.value.locations[0]?.keyFeatures).toEqual([]);
        expect(result.value.locations[0]?.sensoryDetails).toEqual({
          sights: "",
          sounds: "",
          smells: "",
        });
      }
    });

    it("should not include usage when LLM does not return it", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeUndefined();
      }
    });

    it("should recover complete locations from truncated JSON response", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "ruined" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      // Simulate truncated response: 1 complete location, 2nd cut off
      const truncatedJSON = `{
  "locations": [
    {
      "name": "The Shattered Citadel",
      "terrain": "mountain",
      "climate": "cold",
      "size": "large",
      "readAloud": "Broken spires reach toward a grey sky.",
      "keyFeatures": ["Collapsed main gate"],
      "pointsOfInterest": ["The throne room"],
      "sensoryDetails": {
        "sights": "Crumbling walls",
        "sounds": "Wind howling through gaps",
        "smells": "Dust and old stone"
      },
      "encounters": ["Spectral guardians"],
      "secrets": ["A vault beneath the throne"],
      "npcsPresent": ["A scavenger named Krel"],
      "factions": ["The Reclaimers"]
    },
    {
      "name": "Truncated Place",
      "terrain": "for`;

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: truncatedJSON },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should recover the 1 complete location, discard the truncated 2nd
        expect(result.value.locations).toHaveLength(1);
        expect(result.value.locations[0]?.name).toBe("The Shattered Citadel");
      }
    });

    it("should return parse error when truncated JSON has no complete locations", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      const truncatedJSON = `{
  "locations": [
    {
      "name": "The Abyssal Depths",
      "terrain": "under`;

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: truncatedJSON },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("should return parse error when locations array is empty", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"locations": []}' },
          model: "llama3",
        },
      });

      const result = await generateLocations(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("no valid locations");
      }
    });

    it("should include tone in system prompt", async () => {
      const llm = makeMockLLMService();
      const request: LocationGenerationRequest = { campaignId, tone: "magical" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidLocationsJSON(2) },
          model: "llama3",
        },
      });

      await generateLocations(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("MAGICAL");
      expect(callArgs.messages[0].content).toContain("wondrous");
    });
  });
});
