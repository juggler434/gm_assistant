import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions so they are available in vi.mock factories
const { mockSearchChunksByVector, mockSearchChunksByKeyword } = vi.hoisted(() => ({
  mockSearchChunksByVector: vi.fn(),
  mockSearchChunksByKeyword: vi.fn(),
}));

vi.mock("@/modules/knowledge/retrieval/vector-search.js", () => ({
  searchChunksByVector: mockSearchChunksByVector,
}));

vi.mock("@/modules/knowledge/retrieval/keyword-search.js", () => ({
  searchChunksByKeyword: mockSearchChunksByKeyword,
}));

// Import after mocks are set up
import {
  searchChunksHybrid,
  normalizeScores,
} from "@/modules/knowledge/retrieval/hybrid-search.js";
import type {
  VectorSearchResult,
} from "@/modules/knowledge/retrieval/vector-search.js";
import type {
  KeywordSearchResult,
} from "@/modules/knowledge/retrieval/keyword-search.js";

describe("Hybrid Search", () => {
  const campaignId = "123e4567-e89b-12d3-a456-426614174000";
  const embedding = Array(768).fill(0.1);

  function makeVectorResult(
    id: string,
    score: number,
    content = "vector content"
  ): VectorSearchResult {
    return {
      chunk: {
        id,
        content,
        chunkIndex: 0,
        tokenCount: 10,
        pageNumber: 1,
        section: "Section A",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      distance: 1 - score,
      score,
      document: {
        id: "doc-001",
        name: "adventure.pdf",
        documentType: "notes" as const,
        metadata: { author: "GM" },
      },
    };
  }

  function makeKeywordResult(
    id: string,
    rank: number,
    content = "keyword content"
  ): KeywordSearchResult {
    return {
      chunk: {
        id,
        content,
        chunkIndex: 0,
        tokenCount: 10,
        pageNumber: 1,
        section: "Section A",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      rank,
      document: {
        id: "doc-001",
        name: "adventure.pdf",
        documentType: "notes" as const,
        metadata: { author: "GM" },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeScores", () => {
    it("should normalize scores to 0-1 range", () => {
      const result = normalizeScores([0.2, 0.4, 0.8]);
      expect(result).toEqual([0, 1 / 3, 1]);
    });

    it("should return 1.0 for all identical scores", () => {
      const result = normalizeScores([0.5, 0.5, 0.5]);
      expect(result).toEqual([1.0, 1.0, 1.0]);
    });

    it("should return 1.0 for a single score", () => {
      const result = normalizeScores([0.75]);
      expect(result).toEqual([1.0]);
    });

    it("should return empty array for empty input", () => {
      const result = normalizeScores([]);
      expect(result).toEqual([]);
    });

    it("should handle two scores (min becomes 0, max becomes 1)", () => {
      const result = normalizeScores([0.3, 0.9]);
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(1);
    });
  });

  describe("searchChunksHybrid", () => {
    it("should combine vector and keyword results with weighted scoring", async () => {
      // Chunk appears in both searches
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [makeVectorResult("chunk-001", 0.9)],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [makeKeywordResult("chunk-001", 0.1)],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        // Single result in each search normalizes to 1.0
        // combined = 0.7 * 1.0 + 0.3 * 1.0 = 1.0
        expect(result.value[0].score).toBeCloseTo(1.0);
        expect(result.value[0].vectorScore).toBeCloseTo(1.0);
        expect(result.value[0].keywordScore).toBeCloseTo(1.0);
      }
    });

    it("should deduplicate chunks appearing in both searches", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [
          makeVectorResult("chunk-001", 0.9),
          makeVectorResult("chunk-002", 0.7),
        ],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [
          makeKeywordResult("chunk-001", 0.1),
          makeKeywordResult("chunk-003", 0.05),
        ],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 3 unique chunks: chunk-001 (both), chunk-002 (vector only), chunk-003 (keyword only)
        expect(result.value).toHaveLength(3);
        const ids = result.value.map((r) => r.chunk.id);
        expect(ids).toContain("chunk-001");
        expect(ids).toContain("chunk-002");
        expect(ids).toContain("chunk-003");
      }
    });

    it("should rank chunks found in both searches higher", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [
          makeVectorResult("chunk-both", 0.9),
          makeVectorResult("chunk-vector-only", 0.8),
        ],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [
          makeKeywordResult("chunk-both", 0.1),
          makeKeywordResult("chunk-keyword-only", 0.08),
        ],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // chunk-both gets high scores from both searches, so should rank highest
        expect(result.value[0].chunk.id).toBe("chunk-both");
        expect(result.value[0].vectorScore).not.toBeNull();
        expect(result.value[0].keywordScore).not.toBeNull();
      }
    });

    it("should return results sorted by combined score descending", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [
          makeVectorResult("chunk-001", 0.9),
          makeVectorResult("chunk-002", 0.5),
        ],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [
          makeKeywordResult("chunk-002", 0.2),
          makeKeywordResult("chunk-003", 0.1),
        ],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (let i = 1; i < result.value.length; i++) {
          expect(result.value[i - 1].score).toBeGreaterThanOrEqual(
            result.value[i].score
          );
        }
      }
    });

    it("should use default limit of 10", async () => {
      mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
      mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

      await searchChunksHybrid("dragon", embedding, campaignId);

      // Both searches should be called with 2x limit = 20
      expect(mockSearchChunksByVector).toHaveBeenCalledWith(
        embedding,
        campaignId,
        expect.objectContaining({ limit: 20 })
      );
      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "dragon",
        campaignId,
        expect.objectContaining({ limit: 20 })
      );
    });

    it("should apply custom limit and fetch 2x from each search", async () => {
      mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
      mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

      await searchChunksHybrid("dragon", embedding, campaignId, { limit: 5 });

      expect(mockSearchChunksByVector).toHaveBeenCalledWith(
        embedding,
        campaignId,
        expect.objectContaining({ limit: 10 })
      );
      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "dragon",
        campaignId,
        expect.objectContaining({ limit: 10 })
      );
    });

    it("should respect the limit when returning results", async () => {
      const vectorResults = Array.from({ length: 6 }, (_, i) =>
        makeVectorResult(`v-chunk-${i}`, 0.9 - i * 0.1)
      );
      const keywordResults = Array.from({ length: 6 }, (_, i) =>
        makeKeywordResult(`k-chunk-${i}`, 0.1 - i * 0.01)
      );

      mockSearchChunksByVector.mockResolvedValue({ ok: true, value: vectorResults });
      mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: keywordResults });

      const result = await searchChunksHybrid("dragon", embedding, campaignId, {
        limit: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });

    it("should pass through filter options to both searches", async () => {
      mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
      mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

      await searchChunksHybrid("dragon", embedding, campaignId, {
        documentIds: ["doc-001"],
        documentTypes: ["rulebook", "notes"],
        language: "german",
      });

      expect(mockSearchChunksByVector).toHaveBeenCalledWith(
        embedding,
        campaignId,
        expect.objectContaining({
          documentIds: ["doc-001"],
          documentTypes: ["rulebook", "notes"],
        })
      );
      expect(mockSearchChunksByKeyword).toHaveBeenCalledWith(
        "dragon",
        campaignId,
        expect.objectContaining({
          documentIds: ["doc-001"],
          documentTypes: ["rulebook", "notes"],
          language: "german",
        })
      );
    });

    it("should use default weights of 0.7 vector and 0.3 keyword", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [makeVectorResult("chunk-v", 0.9)],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [makeKeywordResult("chunk-k", 0.1)],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // chunk-v: vectorScore=1.0, keywordScore=null → 0.7 * 1.0 + 0.3 * 0 = 0.7
        // chunk-k: vectorScore=null, keywordScore=1.0 → 0.7 * 0 + 0.3 * 1.0 = 0.3
        const chunkV = result.value.find((r) => r.chunk.id === "chunk-v")!;
        const chunkK = result.value.find((r) => r.chunk.id === "chunk-k")!;
        expect(chunkV.score).toBeCloseTo(0.7);
        expect(chunkK.score).toBeCloseTo(0.3);
      }
    });

    it("should support custom weights", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [makeVectorResult("chunk-v", 0.9)],
      });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [makeKeywordResult("chunk-k", 0.1)],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId, {
        vectorWeight: 0.5,
        keywordWeight: 0.5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const chunkV = result.value.find((r) => r.chunk.id === "chunk-v")!;
        const chunkK = result.value.find((r) => r.chunk.id === "chunk-k")!;
        // Each only found in one search: 0.5 * 1.0 + 0.5 * 0 = 0.5
        expect(chunkV.score).toBeCloseTo(0.5);
        expect(chunkK.score).toBeCloseTo(0.5);
      }
    });

    it("should set vectorScore to null for keyword-only results", async () => {
      mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
      mockSearchChunksByKeyword.mockResolvedValue({
        ok: true,
        value: [makeKeywordResult("chunk-001", 0.1)],
      });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].vectorScore).toBeNull();
        expect(result.value[0].keywordScore).not.toBeNull();
      }
    });

    it("should set keywordScore to null for vector-only results", async () => {
      mockSearchChunksByVector.mockResolvedValue({
        ok: true,
        value: [makeVectorResult("chunk-001", 0.9)],
      });
      mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

      const result = await searchChunksHybrid("dragon", embedding, campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].keywordScore).toBeNull();
        expect(result.value[0].vectorScore).not.toBeNull();
      }
    });

    describe("when one search returns no results", () => {
      it("should scale vector weight to 1.0 when keyword returns nothing", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: true,
          value: [
            makeVectorResult("chunk-001", 0.9),
            makeVectorResult("chunk-002", 0.7),
          ],
        });
        mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // With weight scaled to 1.0, top result should get score 1.0
          expect(result.value[0].score).toBeCloseTo(1.0);
          // Bottom result normalized to 0
          expect(result.value[1].score).toBeCloseTo(0.0);
        }
      });

      it("should scale keyword weight to 1.0 when vector returns nothing", async () => {
        mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
        mockSearchChunksByKeyword.mockResolvedValue({
          ok: true,
          value: [
            makeKeywordResult("chunk-001", 0.1),
            makeKeywordResult("chunk-002", 0.05),
          ],
        });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // With weight scaled to 1.0, top result should get score 1.0
          expect(result.value[0].score).toBeCloseTo(1.0);
          expect(result.value[1].score).toBeCloseTo(0.0);
        }
      });

      it("should return empty array when both searches return no results", async () => {
        mockSearchChunksByVector.mockResolvedValue({ ok: true, value: [] });
        mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual([]);
        }
      });
    });

    describe("when one search fails", () => {
      it("should use vector results when keyword search fails", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: true,
          value: [makeVectorResult("chunk-001", 0.9)],
        });
        mockSearchChunksByKeyword.mockResolvedValue({
          ok: false,
          error: { code: "DATABASE_ERROR", message: "connection refused" },
        });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].chunk.id).toBe("chunk-001");
          expect(result.value[0].keywordScore).toBeNull();
        }
      });

      it("should use keyword results when vector search fails", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: false,
          error: { code: "INVALID_EMBEDDING", message: "bad embedding" },
        });
        mockSearchChunksByKeyword.mockResolvedValue({
          ok: true,
          value: [makeKeywordResult("chunk-001", 0.1)],
        });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].chunk.id).toBe("chunk-001");
          expect(result.value[0].vectorScore).toBeNull();
        }
      });

      it("should return error when both searches fail", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: false,
          error: { code: "DATABASE_ERROR", message: "vector db error" },
        });
        mockSearchChunksByKeyword.mockResolvedValue({
          ok: false,
          error: { code: "DATABASE_ERROR", message: "keyword db error" },
        });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("DATABASE_ERROR");
          expect(result.error.message).toBe(
            "Both vector and keyword searches failed"
          );
        }
      });
    });

    describe("validation", () => {
      it("should reject negative vector weight", async () => {
        const result = await searchChunksHybrid("dragon", embedding, campaignId, {
          vectorWeight: -0.1,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_OPTIONS");
        }
      });

      it("should reject negative keyword weight", async () => {
        const result = await searchChunksHybrid("dragon", embedding, campaignId, {
          keywordWeight: -0.1,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_OPTIONS");
        }
      });

      it("should reject when both weights are zero", async () => {
        const result = await searchChunksHybrid("dragon", embedding, campaignId, {
          vectorWeight: 0,
          keywordWeight: 0,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_OPTIONS");
        }
      });
    });

    describe("result format", () => {
      it("should include chunk data in results", async () => {
        const vectorResult = makeVectorResult("chunk-001", 0.9, "The dragon breathes fire.");
        mockSearchChunksByVector.mockResolvedValue({
          ok: true,
          value: [vectorResult],
        });
        mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value[0].chunk).toEqual({
            id: "chunk-001",
            content: "The dragon breathes fire.",
            chunkIndex: 0,
            tokenCount: 10,
            pageNumber: 1,
            section: "Section A",
            createdAt: new Date("2024-01-01T00:00:00Z"),
          });
        }
      });

      it("should include document metadata in results", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: true,
          value: [makeVectorResult("chunk-001", 0.9)],
        });
        mockSearchChunksByKeyword.mockResolvedValue({ ok: true, value: [] });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value[0].document).toEqual({
            id: "doc-001",
            name: "adventure.pdf",
            documentType: "notes",
            metadata: { author: "GM" },
          });
        }
      });

      it("should have score between 0 and 1", async () => {
        mockSearchChunksByVector.mockResolvedValue({
          ok: true,
          value: [
            makeVectorResult("chunk-001", 0.9),
            makeVectorResult("chunk-002", 0.5),
          ],
        });
        mockSearchChunksByKeyword.mockResolvedValue({
          ok: true,
          value: [
            makeKeywordResult("chunk-003", 0.1),
            makeKeywordResult("chunk-001", 0.05),
          ],
        });

        const result = await searchChunksHybrid("dragon", embedding, campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          for (const r of result.value) {
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
          }
        }
      });
    });

    it("should run both searches in parallel", async () => {
      let vectorStarted = false;
      let keywordStarted = false;
      let vectorResolvedBeforeKeywordStarted = false;

      mockSearchChunksByVector.mockImplementation(async () => {
        vectorStarted = true;
        // Check if keyword was already started (parallel execution)
        await new Promise((r) => setTimeout(r, 10));
        if (!keywordStarted) {
          vectorResolvedBeforeKeywordStarted = true;
        }
        return { ok: true, value: [] };
      });

      mockSearchChunksByKeyword.mockImplementation(async () => {
        keywordStarted = true;
        await new Promise((r) => setTimeout(r, 10));
        return { ok: true, value: [] };
      });

      await searchChunksHybrid("dragon", embedding, campaignId);

      // Both should have been called
      expect(vectorStarted).toBe(true);
      expect(keywordStarted).toBe(true);
      // Vector should not have resolved before keyword started (parallel)
      expect(vectorResolvedBeforeKeywordStarted).toBe(false);
    });
  });
});
