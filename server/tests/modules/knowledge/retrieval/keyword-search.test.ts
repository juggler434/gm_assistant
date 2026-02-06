import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock state
let mockExecuteResult: unknown[] = [];

// Mock the db module - keyword search uses db.execute() for raw SQL
vi.mock("@/db/index.js", () => ({
  db: {
    execute: vi.fn(() => Promise.resolve(mockExecuteResult)),
  },
}));

// Mock drizzle-orm sql.raw used for building raw queries
vi.mock("drizzle-orm", () => ({
  sql: {
    raw: vi.fn((queryText: string) => ({ queryText })),
  },
}));

// Import after mocks are set up
import {
  searchChunksByKeyword,
  findMostRelevantChunk,
} from "@/modules/knowledge/retrieval/keyword-search.js";
import { db } from "@/db/index.js";
import { sql } from "drizzle-orm";

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
    mockExecuteResult = [];
  });

  describe("searchChunksByKeyword", () => {
    it("should return matching chunks ranked by relevance", async () => {
      const secondRow = {
        ...mockRow,
        chunk_id: "chunk-002",
        content: "The dragon's lair is hidden in the mountains.",
        rank: 0.05,
      };
      mockExecuteResult = [mockRow, secondRow];

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].rank).toBeGreaterThanOrEqual(result.value[1].rank);
      }
    });

    it("should transform raw rows into KeywordSearchResult format", async () => {
      mockExecuteResult = [mockRow];

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
      mockExecuteResult = [];

      const result = await searchChunksByKeyword("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("should use default limit of 10", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 10")
      );
    });

    it("should apply custom limit", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId, { limit: 5 });

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 5")
      );
    });

    it("should build query with to_tsvector and plainto_tsquery", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("to_tsvector")
      );
      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("plainto_tsquery")
      );
    });

    it("should include ts_rank for relevance scoring", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("ts_rank")
      );
    });

    it("should order results by rank descending", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY rank DESC")
      );
    });

    it("should filter by campaignId", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("c.campaign_id = $1")
      );
    });

    it("should filter by documentIds when provided", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId, {
        documentIds: ["doc-001", "doc-002"],
      });

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("c.document_id IN")
      );
    });

    it("should filter by documentTypes when provided", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId, {
        documentTypes: ["rulebook", "notes"],
      });

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("d.document_type IN")
      );
    });

    it("should use english language config by default", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("$3::regconfig")
      );
    });

    it("should join chunks with documents table", async () => {
      mockExecuteResult = [];

      await searchChunksByKeyword("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("INNER JOIN documents d ON c.document_id = d.id")
      );
    });

    it("should handle null metadata gracefully", async () => {
      mockExecuteResult = [{ ...mockRow, metadata: null }];

      const result = await searchChunksByKeyword("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].document.metadata).toEqual({});
      }
    });

    it("should handle null page_number and section", async () => {
      mockExecuteResult = [
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
      mockExecuteResult = [{ ...mockRow, rank: "0.075" }];

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
        vi.mocked(db.execute).mockRejectedValueOnce(
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
      mockExecuteResult = [mockRow];

      const result = await findMostRelevantChunk("dragon", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.chunk.id).toBe("chunk-001");
      }
    });

    it("should return null when no matches found", async () => {
      mockExecuteResult = [];

      const result = await findMostRelevantChunk("unicorn", campaignId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should use limit of 1", async () => {
      mockExecuteResult = [];

      await findMostRelevantChunk("dragon", campaignId);

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 1")
      );
    });

    it("should pass through filter options", async () => {
      mockExecuteResult = [];

      await findMostRelevantChunk("dragon", campaignId, {
        documentIds: ["doc-001"],
        documentTypes: ["notes"],
      });

      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("c.document_id IN")
      );
      expect(sql.raw).toHaveBeenCalledWith(
        expect.stringContaining("d.document_type IN")
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
      vi.mocked(db.execute).mockRejectedValueOnce(new Error("timeout"));

      const result = await findMostRelevantChunk("dragon", campaignId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });
});
