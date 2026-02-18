// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock state
let mockUnsafeResult: unknown[] = [];

// Mock the db module - keyword search uses queryClient.unsafe() for raw parameterized SQL
vi.mock("@/db/index.js", () => ({
  queryClient: {
    unsafe: vi.fn(() => Promise.resolve(mockUnsafeResult)),
  },
}));

// Import after mocks are set up
import {
  searchChunksByKeyword,
  findMostRelevantChunk,
} from "@/modules/knowledge/retrieval/keyword-search.js";
import { queryClient } from "@/db/index.js";

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
    mockUnsafeResult = [];
  });

  describe("searchChunksByKeyword", () => {
    it("should return matching chunks ranked by relevance", async () => {
      const secondRow = {
        ...mockRow,
        chunk_id: "chunk-002",
        content: "The dragon's lair is hidden in the mountains.",
        rank: 0.05,
      };
      mockUnsafeResult = [mockRow, secondRow];

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].rank).toBeGreaterThanOrEqual(result.value[1].rank);
      }
    });

    it("should transform raw rows into KeywordSearchResult format", async () => {
      mockUnsafeResult = [mockRow];

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
      mockUnsafeResult = [];

      const result = await searchChunksByKeyword("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("should pass campaignId, language, and query words as SQL parameters", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon attack", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([campaignId, "english", "dragon", "attack"])
      );
    });

    it("should use default limit of 10", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 10"),
        expect.any(Array)
      );
    });

    it("should apply custom limit", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId, { limit: 5 });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 5"),
        expect.any(Array)
      );
    });

    it("should build query with to_tsvector and plainto_tsquery", async () => {
      mockUnsafeResult = [];

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

    it("should combine multiple words with OR (||) in tsquery", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon attacks village", campaignId);

      const sql = vi.mocked(queryClient.unsafe).mock.calls[0][0] as string;
      // Each word gets its own plainto_tsquery, joined with ||
      expect(sql).toContain("||");
      // Should have separate parameters for each word
      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["dragon", "attacks", "village"])
      );
    });

    it("should filter out short words (1-2 chars) from tsquery", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("a dragon is at the village", campaignId);

      // "a", "is", "at" are <= 2 chars and should be filtered out
      const params = vi.mocked(queryClient.unsafe).mock.calls[0][1] as string[];
      expect(params).toContain("dragon");
      expect(params).toContain("the");
      expect(params).toContain("village");
      expect(params).not.toContain("a");
      expect(params).not.toContain("is");
      expect(params).not.toContain("at");
    });

    it("should fall back to full query when all words are short", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("do it", campaignId);

      const params = vi.mocked(queryClient.unsafe).mock.calls[0][1] as string[];
      // Falls back to full trimmed query
      expect(params).toContain("do it");
    });

    it("should include ts_rank for relevance scoring", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("ts_rank"),
        expect.any(Array)
      );
    });

    it("should order results by rank descending", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY rank DESC"),
        expect.any(Array)
      );
    });

    it("should filter by campaignId", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("c.campaign_id = $1"),
        expect.any(Array)
      );
    });

    it("should filter by documentIds when provided", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId, {
        documentIds: ["doc-001", "doc-002"],
      });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("c.document_id IN"),
        expect.arrayContaining(["doc-001", "doc-002"])
      );
    });

    it("should filter by documentTypes when provided", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId, {
        documentTypes: ["rulebook", "notes"],
      });

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("d.document_type IN"),
        expect.arrayContaining(["rulebook", "notes"])
      );
    });

    it("should use english language config by default", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("$2::regconfig"),
        expect.arrayContaining(["english"])
      );
    });

    it("should join chunks with documents table", async () => {
      mockUnsafeResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("INNER JOIN documents d ON c.document_id = d.id"),
        expect.any(Array)
      );
    });

    it("should handle null metadata gracefully", async () => {
      mockUnsafeResult = [{ ...mockRow, metadata: null }];

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].document.metadata).toEqual({});
      }
    });

    it("should handle null page_number and section", async () => {
      mockUnsafeResult = [
        { ...mockRow, page_number: null, section: null },
      ];

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].chunk.pageNumber).toBeNull();
        expect(result.value[0].chunk.section).toBeNull();
      }
    });

    it("should convert rank to number", async () => {
      // PostgreSQL may return rank as string
      mockUnsafeResult = [{ ...mockRow, rank: "0.075" }];

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
      mockUnsafeResult = [mockRow];

      const result = await findMostRelevantChunk("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.chunk.id).toBe("chunk-001");
      }
    });

    it("should return null when no matches found", async () => {
      mockUnsafeResult = [];

      const result = await findMostRelevantChunk("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should use limit of 1", async () => {
      mockUnsafeResult = [];

      await findMostRelevantChunk("dragon", campaignId);

      expect(queryClient.unsafe).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 1"),
        expect.any(Array)
      );
    });

    it("should pass through filter options", async () => {
      mockUnsafeResult = [];

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
