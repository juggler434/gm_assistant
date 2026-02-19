// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock state
let mockUnsafeResults: unknown[][] = [];
let callIndex = 0;

// Mock the db module - keyword search uses queryClient.unsafe() for raw parameterized SQL
vi.mock("@/db/index.js", () => ({
  queryClient: {
    unsafe: vi.fn(() => {
      const result = mockUnsafeResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(result);
    }),
  },
}));

// Import after mocks are set up
import {
  searchChunksByKeyword,
  findMostRelevantChunk,
} from "@/modules/knowledge/retrieval/keyword-search.js";
import { queryClient } from "@/db/index.js";

/** Helper: set mock to return the same result for all calls */
function setMockResult(result: unknown[]) {
  mockUnsafeResults = [result, result];
}

/** Helper: set mock to return different results for AND (first) and OR (second) calls */
function setMockResults(andResult: unknown[], orResult: unknown[]) {
  mockUnsafeResults = [andResult, orResult];
}

describe("Keyword Search", () => {
  const campaignId = "123e4567-e89b-12d3-a456-426614174000";

  const mockRow = {
    chunk_id: "chunk-001",
    content: "The dragon attacks the village at dawn.",
    chunk_index: 0,
    token_count: 8,
    page_number: 1,
    section: "Chapter 1",
    chunk_created_at: new Date("2024-01-01T00:00:00Z"),
    rank: 0.075,
    document_id: "doc-001",
    document_name: "adventure-notes.pdf",
    document_type: "notes" as const,
    metadata: { author: "GM" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsafeResults = [];
    callIndex = 0;
  });

  describe("searchChunksByKeyword", () => {
    it("should return matching chunks ranked by relevance", async () => {
      const secondRow = {
        ...mockRow,
        chunk_id: "chunk-002",
        content: "The dragon's lair is hidden in the mountains.",
        rank: 0.05,
      };
      setMockResult([mockRow, secondRow]);

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].rank).toBeGreaterThanOrEqual(result.value[1].rank);
      }
    });

    it("should transform raw rows into KeywordSearchResult format", async () => {
      setMockResult([mockRow]);

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]).toEqual({
          chunk: {
            id: "chunk-001",
            content: "The dragon attacks the village at dawn.",
            chunkIndex: 0,
            tokenCount: 8,
            pageNumber: 1,
            section: "Chapter 1",
            createdAt: new Date("2024-01-01T00:00:00Z"),
          },
          rank: 0.075,
          document: {
            id: "doc-001",
            name: "adventure-notes.pdf",
            documentType: "notes",
            metadata: { author: "GM" },
          },
        });
      }
    });

    it("should return empty array when no matches found", async () => {
      setMockResult([]);

      const result = await searchChunksByKeyword("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    describe("AND-first with OR fallback", () => {
      it("should use AND search (plainto_tsquery) first", async () => {
        // Return 3+ results from AND so it doesn't fall back
        const rows = [mockRow, { ...mockRow, chunk_id: "c2" }, { ...mockRow, chunk_id: "c3" }];
        setMockResults(rows, []);

        await searchChunksByKeyword("dragon attacks village", campaignId);

        // Only AND query should be called (3 results >= threshold)
        expect(queryClient.unsafe).toHaveBeenCalledTimes(1);
        const sql = vi.mocked(queryClient.unsafe).mock.calls[0][0] as string;
        // AND search uses a single plainto_tsquery with the full query
        expect(sql).toContain("plainto_tsquery($2::regconfig, $3)");
        expect(sql).not.toContain("||");
      });

      it("should fall back to OR when AND returns fewer than 3 results", async () => {
        // AND returns 1 result, OR returns 5
        const orRows = Array.from({ length: 5 }, (_, i) => ({
          ...mockRow,
          chunk_id: `chunk-${i}`,
        }));
        setMockResults([mockRow], orRows);

        const result = await searchChunksByKeyword("dragon attacks village", campaignId);

        // Both AND and OR queries should be called
        expect(queryClient.unsafe).toHaveBeenCalledTimes(2);
        // Second call (OR) should use || syntax
        const orSql = vi.mocked(queryClient.unsafe).mock.calls[1][0] as string;
        expect(orSql).toContain("||");

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(5);
        }
      });

      it("should keep AND results when they outnumber OR results", async () => {
        // AND returns 2, OR returns 1 — should keep AND
        setMockResults(
          [mockRow, { ...mockRow, chunk_id: "c2" }],
          [mockRow],
        );

        const result = await searchChunksByKeyword("dragon attacks village", campaignId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(2);
        }
      });

      it("should not fall back to OR when AND returns enough results", async () => {
        const rows = [
          mockRow,
          { ...mockRow, chunk_id: "c2" },
          { ...mockRow, chunk_id: "c3" },
        ];
        setMockResults(rows, []);

        await searchChunksByKeyword("dragon attacks village", campaignId);

        // Only AND query should be called
        expect(queryClient.unsafe).toHaveBeenCalledTimes(1);
      });
    });

    describe("OR fallback tsquery construction", () => {
      it("should combine multiple words with OR (||) in OR fallback", async () => {
        setMockResult([]);

        await searchChunksByKeyword("dragon attacks village", campaignId);

        // Second call is OR fallback
        const orSql = vi.mocked(queryClient.unsafe).mock.calls[1][0] as string;
        expect(orSql).toContain("||");
        expect(queryClient.unsafe).toHaveBeenNthCalledWith(
          2,
          expect.any(String),
          expect.arrayContaining(["dragon", "attacks", "village"])
        );
      });

      it("should filter out short words and stop words from OR tsquery", async () => {
        setMockResult([]);

        await searchChunksByKeyword("a dragon is at the village", campaignId);

        // Second call is OR fallback — "a", "is", "at" (short) and "the" (stop word) should be filtered
        const params = vi.mocked(queryClient.unsafe).mock.calls[1][1] as string[];
        expect(params).toContain("dragon");
        expect(params).toContain("village");
        expect(params).not.toContain("a");
        expect(params).not.toContain("is");
        expect(params).not.toContain("at");
        expect(params).not.toContain("the");
      });

      it("should filter common stop words from OR tsquery", async () => {
        setMockResult([]);

        await searchChunksByKeyword("who is giving the challenger lecture", campaignId);

        // Second call is OR fallback — "who", "the", "giving" are stop words
        const params = vi.mocked(queryClient.unsafe).mock.calls[1][1] as string[];
        expect(params).toContain("challenger");
        expect(params).toContain("lecture");
        expect(params).not.toContain("who");
        expect(params).not.toContain("the");
      });

      it("should fall back to full query when all words are short or stop words", async () => {
        setMockResult([]);

        await searchChunksByKeyword("do it", campaignId);

        // Second call is OR fallback — falls back to full query
        const params = vi.mocked(queryClient.unsafe).mock.calls[1][1] as string[];
        expect(params).toContain("do it");
      });
    });

    it("should use default limit of 10", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      // Both AND and OR calls should use the same limit
      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 10"),
        expect.any(Array)
      );
    });

    it("should apply custom limit", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId, { limit: 5 });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 5"),
        expect.any(Array)
      );
    });

    it("should build query with to_tsvector and plainto_tsquery", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("to_tsvector"),
        expect.any(Array)
      );
      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("plainto_tsquery"),
        expect.any(Array)
      );
    });

    it("should include ts_rank for relevance scoring", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("ts_rank"),
        expect.any(Array)
      );
    });

    it("should order results by rank descending", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY rank DESC"),
        expect.any(Array)
      );
    });

    it("should filter by campaignId", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("c.campaign_id = $1"),
        expect.any(Array)
      );
    });

    it("should filter by documentIds when provided", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId, {
        documentIds: ["doc-001", "doc-002"],
      });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("c.document_id IN"),
        expect.arrayContaining(["doc-001", "doc-002"])
      );
    });

    it("should filter by documentTypes when provided", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId, {
        documentTypes: ["rulebook", "notes"],
      });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("d.document_type IN"),
        expect.arrayContaining(["rulebook", "notes"])
      );
    });

    it("should use english language config by default", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("$2::regconfig"),
        expect.arrayContaining(["english"])
      );
    });

    it("should join chunks with documents table", async () => {
      setMockResult([]);

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("INNER JOIN documents d ON c.document_id = d.id"),
        expect.any(Array)
      );
    });

    it("should handle null metadata gracefully", async () => {
      setMockResult([{ ...mockRow, metadata: null }]);

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].document.metadata).toEqual({});
      }
    });

    it("should handle null page_number and section", async () => {
      setMockResult([
        { ...mockRow, page_number: null, section: null },
      ]);

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].chunk.pageNumber).toBeNull();
        expect(result.value[0].chunk.section).toBeNull();
      }
    });

    it("should convert rank to number", async () => {
      // PostgreSQL may return rank as string
      setMockResult([{ ...mockRow, rank: "0.075" }]);

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value[0].rank).toBe("number");
        expect(result.value[0].rank).toBe(0.075);
      }
    });

    describe("validation", () => {
      it("should reject empty query string", async () => {
        const result = await searchChunksByKeyword("", campaignId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_QUERY");
        }
      });

      it("should reject whitespace-only query string", async () => {
        const result = await searchChunksByKeyword("   ", campaignId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_QUERY");
        }
      });
    });

    describe("error handling", () => {
      it("should return DATABASE_ERROR when query fails", async () => {
        vi.mocked(queryClient.unsafe).mockRejectedValueOnce(
          new Error("connection refused")
        );

        const result = await searchChunksByKeyword("dragon", campaignId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("DATABASE_ERROR");
          expect(result.error.message).toBe("Failed to execute keyword search");
          expect(result.error.cause).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe("findMostRelevantChunk", () => {
    it("should return the top-ranked chunk", async () => {
      setMockResult([mockRow]);

      const result = await findMostRelevantChunk("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.chunk.id).toBe("chunk-001");
      }
    });

    it("should return null when no matches found", async () => {
      setMockResult([]);

      const result = await findMostRelevantChunk("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should use limit of 1", async () => {
      setMockResult([]);

      await findMostRelevantChunk("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 1"),
        expect.any(Array)
      );
    });

    it("should pass through filter options", async () => {
      setMockResult([]);

      await findMostRelevantChunk("dragon", campaignId, {
        documentIds: ["doc-001"],
        documentTypes: ["notes"],
      });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("c.document_id IN"),
        expect.any(Array)
      );
      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("d.document_type IN"),
        expect.any(Array)
      );
    });

    it("should propagate validation errors", async () => {
      const result = await findMostRelevantChunk("", campaignId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_QUERY");
      }
    });

    it("should propagate database errors", async () => {
      vi.mocked(queryClient.unsafe).mockRejectedValueOnce(new Error("timeout"));

      const result = await findMostRelevantChunk("dragon", campaignId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });
});
