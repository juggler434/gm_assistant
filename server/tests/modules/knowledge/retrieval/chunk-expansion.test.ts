// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUnsafe } = vi.hoisted(() => ({
  mockUnsafe: vi.fn(),
}));

vi.mock("@/db/index.js", () => ({
  queryClient: { unsafe: mockUnsafe },
}));

import { expandNeighborChunks } from "@/modules/knowledge/retrieval/chunk-expansion.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";

function makeResult(
  chunkId: string,
  docId: string,
  chunkIndex: number,
  content: string,
  score = 0.9,
  pageNumber: number | null = 1,
  endPageNumber: number | null = null,
): HybridSearchResult {
  return {
    chunk: {
      id: chunkId,
      content,
      chunkIndex,
      tokenCount: 10,
      pageNumber,
      endPageNumber,
      section: null,
      createdAt: new Date("2024-01-01"),
    },
    score,
    vectorScore: score,
    keywordScore: null,
    document: {
      id: docId,
      name: "Test Doc",
      documentType: "rulebook" as const,
      metadata: {},
    },
  };
}

describe("expandNeighborChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array unchanged", async () => {
    const result = await expandNeighborChunks([]);
    expect(result).toEqual([]);
    expect(mockUnsafe).not.toHaveBeenCalled();
  });

  it("should prepend and append neighbor content", async () => {
    const results = [makeResult("c2", "doc-1", 2, "Middle chunk.")];

    mockUnsafe.mockResolvedValue([
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "Previous chunk.", token_count: 5, page_number: null, end_page_number: null },
      { id: "c3", document_id: "doc-1", chunk_index: 3, content: "Next chunk.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe(
      "Previous chunk.\n\nMiddle chunk.\n\nNext chunk.",
    );
  });

  it("should only prepend when no next neighbor exists", async () => {
    const results = [makeResult("c2", "doc-1", 2, "Last chunk.")];

    mockUnsafe.mockResolvedValue([
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "Before.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe("Before.\n\nLast chunk.");
  });

  it("should only append when chunk is at index 0", async () => {
    const results = [makeResult("c0", "doc-1", 0, "First chunk.")];

    mockUnsafe.mockResolvedValue([
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "After.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe("First chunk.\n\nAfter.");
  });

  it("should skip neighbors that are already in the result set", async () => {
    // c1 and c2 are both retrieved results; c2's neighbor c1 should be skipped
    const results = [
      makeResult("c1", "doc-1", 1, "Chunk one."),
      makeResult("c2", "doc-1", 2, "Chunk two."),
    ];

    mockUnsafe.mockResolvedValue([
      // c1 is a neighbor of c2 but already in results
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "Chunk one.", token_count: 5, page_number: null, end_page_number: null },
      // c0 is a neighbor of c1
      { id: "c0", document_id: "doc-1", chunk_index: 0, content: "Chunk zero.", token_count: 5, page_number: null, end_page_number: null },
      // c3 is a neighbor of c2
      { id: "c3", document_id: "doc-1", chunk_index: 3, content: "Chunk three.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    // c1 should only get c0 prepended (c2 is already a result)
    expect(results[0].chunk.content).toBe("Chunk zero.\n\nChunk one.");
    // c2 should only get c3 appended (c1 is already a result)
    expect(results[1].chunk.content).toBe("Chunk two.\n\nChunk three.");
  });

  it("should handle multiple documents independently", async () => {
    const results = [
      makeResult("a1", "doc-a", 1, "Doc A chunk."),
      makeResult("b1", "doc-b", 1, "Doc B chunk."),
    ];

    mockUnsafe.mockResolvedValue([
      { id: "a0", document_id: "doc-a", chunk_index: 0, content: "Doc A prev.", token_count: 5, page_number: null, end_page_number: null },
      { id: "a2", document_id: "doc-a", chunk_index: 2, content: "Doc A next.", token_count: 5, page_number: null, end_page_number: null },
      { id: "b0", document_id: "doc-b", chunk_index: 0, content: "Doc B prev.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe("Doc A prev.\n\nDoc A chunk.\n\nDoc A next.");
    expect(results[1].chunk.content).toBe("Doc B prev.\n\nDoc B chunk.");
  });

  it("should return results unchanged if the DB query fails", async () => {
    const results = [makeResult("c1", "doc-1", 1, "Original content.")];

    mockUnsafe.mockRejectedValue(new Error("Connection lost"));

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe("Original content.");
  });

  it("should leave content unchanged when no neighbors are found", async () => {
    const results = [makeResult("c5", "doc-1", 5, "Lonely chunk.")];

    mockUnsafe.mockResolvedValue([]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.content).toBe("Lonely chunk.");
  });

  it("should widen page range to cover prepended and appended neighbors", async () => {
    // Matched chunk is on page 5; prev neighbor on page 4, next neighbor on page 6.
    const results = [makeResult("c2", "doc-1", 2, "Middle.", 0.9, 5, 5)];

    mockUnsafe.mockResolvedValue([
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "Prev.", token_count: 5, page_number: 4, end_page_number: 4 },
      { id: "c3", document_id: "doc-1", chunk_index: 3, content: "Next.", token_count: 5, page_number: 6, end_page_number: 7 },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.pageNumber).toBe(4);
    expect(results[0].chunk.endPageNumber).toBe(7);
  });

  it("should leave page range alone when neighbors have null page numbers", async () => {
    // Legacy chunks indexed before endPageNumber existed have null page metadata.
    const results = [makeResult("c2", "doc-1", 2, "Middle.", 0.9, 5, 5)];

    mockUnsafe.mockResolvedValue([
      { id: "c1", document_id: "doc-1", chunk_index: 1, content: "Prev.", token_count: 5, page_number: null, end_page_number: null },
      { id: "c3", document_id: "doc-1", chunk_index: 3, content: "Next.", token_count: 5, page_number: null, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.pageNumber).toBe(5);
    expect(results[0].chunk.endPageNumber).toBe(5);
  });

  it("should fall back to neighbor pageNumber when its endPageNumber is null", async () => {
    const results = [makeResult("c2", "doc-1", 2, "Middle.", 0.9, 5, null)];

    mockUnsafe.mockResolvedValue([
      { id: "c3", document_id: "doc-1", chunk_index: 3, content: "Next.", token_count: 5, page_number: 6, end_page_number: null },
    ]);

    await expandNeighborChunks(results);

    expect(results[0].chunk.pageNumber).toBe(5);
    expect(results[0].chunk.endPageNumber).toBe(6);
  });
});
