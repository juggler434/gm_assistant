// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchChunksByKeyword } = vi.hoisted(() => ({
  mockSearchChunksByKeyword: vi.fn(),
}));

vi.mock("@/modules/knowledge/retrieval/keyword-search.js", () => ({
  searchChunksByKeyword: mockSearchChunksByKeyword,
}));

import {
  searchEntities,
  mergeEntityResults,
} from "@/modules/generation/generators/entity-search.js";
import type { KeywordSearchResult } from "@/modules/knowledge/retrieval/keyword-search.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";

function makeKeywordResult(
  id: string,
  content: string,
  rank: number,
  docName = "Setting Guide",
  documentType: "setting" | "notes" | "rulebook" = "setting",
): KeywordSearchResult {
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
    rank,
    document: {
      id: "doc-001",
      name: docName,
      documentType,
      metadata: {},
    },
  };
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

describe("Entity Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchEntities", () => {
    it("should call searchChunksByKeyword with entity text", async () => {
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [makeKeywordResult("c1", "The Crimson Whip operates in the shadows.", 0.8)],
      });

      const results = await searchEntities(
        "The Society of the Crimson Whip",
        "campaign-001",
        { limit: 4, documentTypes: ["setting", "notes"] },
      );

      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "The Society of the Crimson Whip",
        "campaign-001",
        { limit: 4, documentTypes: ["setting", "notes"] },
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.chunk.content).toContain("Crimson Whip");
    });

    it("should return empty array for empty input", async () => {
      const results = await searchEntities("", "campaign-001");

      expect(results).toEqual([]);
      expect(mockSearchChunksByKeyword).not.toHaveBeenCalled();
    });

    it("should return empty array for whitespace-only input", async () => {
      const results = await searchEntities("   ", "campaign-001");

      expect(results).toEqual([]);
      expect(mockSearchChunksByKeyword).not.toHaveBeenCalled();
    });

    it("should return empty array when keyword search fails", async () => {
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", message: "Connection lost" },
      });

      const results = await searchEntities("Some Entity", "campaign-001");

      expect(results).toEqual([]);
    });

    it("should use default limit of 4 when not specified", async () => {
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [],
      });

      await searchEntities("Some Entity", "campaign-001");

      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "Some Entity",
        "campaign-001",
        { limit: 4 },
      );
    });

    it("should pass documentTypes when specified", async () => {
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [],
      });

      await searchEntities("Some Entity", "campaign-001", {
        documentTypes: ["setting", "notes", "rulebook"],
      });

      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "Some Entity",
        "campaign-001",
        { limit: 4, documentTypes: ["setting", "notes", "rulebook"] },
      );
    });
  });

  describe("mergeEntityResults", () => {
    it("should return general results unchanged when no entity results", () => {
      const general = [
        makeHybridResult("c1", "General content.", 0.8),
        makeHybridResult("c2", "More content.", 0.6),
      ];

      const merged = mergeEntityResults([], general);

      expect(merged).toEqual(general);
    });

    it("should place entity results before general results", () => {
      const entityResults = [
        makeKeywordResult("e1", "Entity chunk about the Crimson Whip.", 0.9),
      ];
      const generalResults = [
        makeHybridResult("c1", "General setting info.", 0.8),
      ];

      const merged = mergeEntityResults(entityResults, generalResults);

      expect(merged).toHaveLength(2);
      expect(merged[0]?.chunk.id).toBe("e1");
      expect(merged[1]?.chunk.id).toBe("c1");
    });

    it("should assign entity scores above top general score", () => {
      const entityResults = [
        makeKeywordResult("e1", "Entity chunk.", 0.5),
      ];
      const generalResults = [
        makeHybridResult("c1", "General chunk.", 0.8),
        makeHybridResult("c2", "Another chunk.", 0.6),
      ];

      const merged = mergeEntityResults(entityResults, generalResults);

      // Entity score should be above 0.8 (top general score)
      expect(merged[0]?.score).toBeGreaterThan(0.8);
    });

    it("should assign decreasing scores for multiple entity results", () => {
      const entityResults = [
        makeKeywordResult("e1", "First entity.", 0.9),
        makeKeywordResult("e2", "Second entity.", 0.7),
        makeKeywordResult("e3", "Third entity.", 0.5),
      ];
      const generalResults = [
        makeHybridResult("c1", "General chunk.", 0.8),
      ];

      const merged = mergeEntityResults(entityResults, generalResults);

      expect(merged[0]?.score).toBeGreaterThan(merged[1]!.score);
      expect(merged[1]?.score).toBeGreaterThan(merged[2]!.score);
    });

    it("should deduplicate by chunk ID, preferring entity results", () => {
      const entityResults = [
        makeKeywordResult("shared-id", "Entity version of chunk.", 0.9),
      ];
      const generalResults = [
        makeHybridResult("shared-id", "General version of chunk.", 0.8),
        makeHybridResult("c2", "Other chunk.", 0.6),
      ];

      const merged = mergeEntityResults(entityResults, generalResults);

      expect(merged).toHaveLength(2);
      expect(merged[0]?.chunk.id).toBe("shared-id");
      expect(merged[0]?.chunk.content).toBe("Entity version of chunk.");
      expect(merged[1]?.chunk.id).toBe("c2");
    });

    it("should set vectorScore to null for entity results", () => {
      const entityResults = [
        makeKeywordResult("e1", "Entity chunk.", 0.9),
      ];

      const merged = mergeEntityResults(entityResults, []);

      expect(merged[0]?.vectorScore).toBeNull();
    });

    it("should preserve keyword rank from entity results", () => {
      const entityResults = [
        makeKeywordResult("e1", "Entity chunk.", 0.75),
      ];

      const merged = mergeEntityResults(entityResults, []);

      expect(merged[0]?.keywordScore).toBe(0.75);
    });

    it("should use default score of 0.5 when no general results exist", () => {
      const entityResults = [
        makeKeywordResult("e1", "Entity chunk.", 0.9),
      ];

      const merged = mergeEntityResults(entityResults, []);

      // Should be 0.5 + 0.1 = 0.6
      expect(merged[0]?.score).toBeCloseTo(0.6, 2);
    });
  });
});
