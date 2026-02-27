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

import { generateNpcs } from "@/modules/generation/generators/npc.js";
import type { NpcGenerationRequest } from "@/modules/generation/types.js";
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
    json: async () => ({ embeddings: [Array(1024).fill(0.1)] }),
    text: async () => "",
  });
}

function makeValidNpcsJSON(count = 2): string {
  const npcs = Array.from({ length: count }, (_, i) => ({
    name: `NPC ${i + 1}`,
    race: "Human",
    classRole: "Fighter",
    level: "Level 5",
    appearance: `A tall warrior with scars from many battles.`,
    personality: `Brave and stoic, rarely speaks.`,
    motivations: `Seeks to protect the innocent.`,
    secrets: `Has a hidden family.`,
    backstory: `Grew up on the streets, joined the guard.`,
    statBlock: null,
    statBlockGrounded: false,
  }));
  return JSON.stringify({ npcs });
}

describe("NPC Generator", () => {
  const campaignId = "campaign-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateNpcs", () => {
    it("should generate NPCs with setting context and sources", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

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
          message: { role: "assistant", content: makeValidNpcsJSON(3) },
          model: "llama3",
          usage: { promptTokens: 500, completionTokens: 400, totalTokens: 900 },
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs).toHaveLength(3);
        expect(result.value.npcs[0]).toHaveProperty("name");
        expect(result.value.npcs[0]).toHaveProperty("race");
        expect(result.value.npcs[0]).toHaveProperty("classRole");
        expect(result.value.npcs[0]).toHaveProperty("appearance");
        expect(result.value.npcs[0]).toHaveProperty("personality");
        expect(result.value.npcs[0]).toHaveProperty("motivations");
        expect(result.value.npcs[0]).toHaveProperty("secrets");
        expect(result.value.npcs[0]).toHaveProperty("backstory");
        expect(result.value.sources).toHaveLength(2);
        expect(result.value.chunksUsed).toBe(2);
        expect(result.value.usage).toEqual({
          promptTokens: 500,
          completionTokens: 400,
          totalTokens: 900,
        });
      }
    });

    it("should return error when embedding fails", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMBEDDING_FAILED");
      }
    });

    it("should return error when hybrid search fails", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "mysterious" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", message: "Connection lost" },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SEARCH_FAILED");
        expect(result.error.message).toContain("Connection lost");
      }
    });

    it("should return error when LLM generation fails", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "comedic" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "The Jolly Jester tavern.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: false,
        error: { message: "Model not found", code: "MODEL_NOT_FOUND" },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GENERATION_FAILED");
      }
    });

    it("should return error when LLM returns invalid JSON", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "Not JSON" },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("should return error when response missing npcs array", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"characters": []}' },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("npcs");
      }
    });

    it("should handle markdown code fencing", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });

      const jsonContent = makeValidNpcsJSON(2);
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: "```json\n" + jsonContent + "\n```" },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs).toHaveLength(2);
      }
    });

    it("should handle empty search results gracefully", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "heroic" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs).toHaveLength(2);
        expect(result.value.sources).toHaveLength(0);
        expect(result.value.chunksUsed).toBe(0);
      }
    });

    it("should search with setting, notes, and rulebook document types", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      expect(mockSearchChunksHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        campaignId,
        expect.objectContaining({
          documentTypes: ["setting", "notes", "rulebook"],
        }),
      );
    });

    it("should use creative temperature for generation", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting.", 0.8)],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.temperature).toBe(0.85);
    });

    it("should include race in prompt when specified", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "heroic",
        race: "Dwarf",
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Dwarf");
    });

    it("should include classRole in prompt when specified", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "dark",
        classRole: "Necromancer",
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Necromancer");
    });

    it("should request setting-aware race when none specified", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("appropriate race/species");
    });

    it("should handle NPCs with missing optional fields gracefully", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      const incompleteJSON = JSON.stringify({
        npcs: [{ name: "Mystery Figure" }],
      });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: incompleteJSON },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs).toHaveLength(1);
        expect(result.value.npcs[0]?.name).toBe("Mystery Figure");
        expect(result.value.npcs[0]?.race).toBe("");
        expect(result.value.npcs[0]?.classRole).toBe("");
      }
    });

    it("should mark statBlockGrounded false when no rulebook chunks", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "dark",
        includeStatBlock: true,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [makeHybridResult("c1", "Setting info.", 0.8, "World Guide", "setting")],
      });

      const npcWithStats = JSON.stringify({
        npcs: [{
          name: "Test NPC",
          race: "Human",
          classRole: "Fighter",
          level: "Level 5",
          appearance: "Tall",
          personality: "Brave",
          motivations: "Glory",
          secrets: "None",
          backstory: "A warrior",
          statBlock: { strength: 16, hitPoints: 45 },
          statBlockGrounded: true,
        }],
      });

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: npcWithStats },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Even though LLM says grounded, there are no rulebook chunks
        expect(result.value.npcs[0]?.statBlockGrounded).toBe(false);
        expect(result.value.npcs[0]?.statBlock).toEqual({ strength: 16, hitPoints: 45 });
      }
    });

    it("should mark statBlockGrounded true when rulebook chunks present", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "heroic",
        includeStatBlock: true,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({
        ok: true,
        value: [
          makeHybridResult("c1", "Fighter class stats...", 0.9, "D&D PHB", "rulebook"),
          makeHybridResult("c2", "World lore...", 0.7, "Setting Guide", "setting"),
        ],
      });

      const npcWithStats = JSON.stringify({
        npcs: [{
          name: "Sir Galahad",
          race: "Human",
          classRole: "Paladin",
          level: "Level 8",
          appearance: "Radiant",
          personality: "Noble",
          motivations: "Justice",
          secrets: "Doubts faith",
          backstory: "Chosen by the gods",
          statBlock: { strength: 18, hitPoints: 72, armorClass: 18 },
          statBlockGrounded: true,
        }],
      });

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: npcWithStats },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs[0]?.statBlockGrounded).toBe(true);
      }
    });

    it("should return parse error when npcs array is empty", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: '{"npcs": []}' },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("no valid NPCs");
      }
    });

    it("should not include usage when LLM does not return it", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeUndefined();
      }
    });

    it("should include stat block instruction when includeStatBlock is true", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "heroic",
        includeStatBlock: true,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Include a stat block");
    });

    it("should exclude stat block instruction when includeStatBlock is false", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "heroic",
        includeStatBlock: false,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Do NOT include stat blocks");
    });

    it("should recover complete NPCs from truncated JSON response", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      // Simulate truncated response: 2 complete NPCs, 3rd cut off
      const truncatedJSON = `{
  "npcs": [
    {
      "name": "Complete NPC 1",
      "race": "Elf",
      "classRole": "Ranger",
      "level": "Level 3",
      "appearance": "Tall and lean",
      "personality": "Quiet",
      "motivations": "Protect the forest",
      "secrets": "Exiled from home",
      "backstory": "A wanderer",
      "statBlock": null,
      "statBlockGrounded": false
    },
    {
      "name": "Complete NPC 2",
      "race": "Dwarf",
      "classRole": "Cleric",
      "level": "Level 5",
      "appearance": "Stocky with a braided beard",
      "personality": "Jovial",
      "motivations": "Find lost relics",
      "secrets": "Doubts the gods",
      "backstory": "Former miner",
      "statBlock": null,
      "statBlockGrounded": false
    },
    {
      "name": "Truncated NPC",
      "race": "Hum`;

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: truncatedJSON },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should recover the 2 complete NPCs, discard the truncated 3rd
        expect(result.value.npcs).toHaveLength(2);
        expect(result.value.npcs[0]?.name).toBe("Complete NPC 1");
        expect(result.value.npcs[1]?.name).toBe("Complete NPC 2");
      }
    });

    it("should recover NPCs from truncated JSON with nested stat blocks", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "heroic",
        includeStatBlock: true,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      // Complete NPC with stat block + truncated second NPC
      const truncatedJSON = `{
  "npcs": [
    {
      "name": "Sir Aldric",
      "race": "Human",
      "classRole": "Paladin",
      "level": "Level 8",
      "appearance": "Imposing",
      "personality": "Noble",
      "motivations": "Justice",
      "secrets": "Hidden past",
      "backstory": "Knight of the realm",
      "statBlock": { "strength": 18, "dexterity": 12, "hitPoints": 72, "armorClass": 18 },
      "statBlockGrounded": false
    },
    {
      "name": "Truncated Wizard",
      "race": "Elf",
      "classRole": "Wizard",
      "statBlock": { "intelligence": 20`;

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: truncatedJSON },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.npcs).toHaveLength(1);
        expect(result.value.npcs[0]?.name).toBe("Sir Aldric");
        expect(result.value.npcs[0]?.statBlock).toEqual({
          strength: 18, dexterity: 12, hitPoints: 72, armorClass: 18,
        });
      }
    });

    it("should return parse error when truncated JSON has no complete NPCs", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = { campaignId, tone: "dark" };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });

      // Truncated before even the first NPC is complete
      const truncatedJSON = `{
  "npcs": [
    {
      "name": "Kaelen, the Serpent's Scion",
      "race": "Naga`;

      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: truncatedJSON },
          model: "llama3",
        },
      });

      const result = await generateNpcs(request, llm);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("should include count in system prompt when provided", async () => {
      const llm = makeMockLLMService();
      const request: NpcGenerationRequest = {
        campaignId,
        tone: "dark",
        count: 4,
      };

      mockEmbeddingResponse();
      mockSearchChunksHybrid.mockResolvedValue({ ok: true, value: [] });
      mockChat.mockResolvedValue({
        ok: true,
        value: {
          message: { role: "assistant", content: makeValidNpcsJSON(2) },
          model: "llama3",
        },
      });

      await generateNpcs(request, llm);

      const callArgs = mockChat.mock.calls[0]![0]!;
      expect(callArgs.messages[0].content).toContain("Generate exactly 4 NPCs.");
    });
  });
});
