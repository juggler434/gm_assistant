import { describe, it, expect } from "vitest";
import {
  buildContext,
  estimateTokens,
} from "@/modules/query/rag/context-builder.js";
import type { HybridSearchResult } from "@/modules/knowledge/retrieval/hybrid-search.js";

function makeSearchResult(
  overrides: Partial<{
    chunkId: string;
    content: string;
    score: number;
    documentId: string;
    documentName: string;
    documentType: string;
    pageNumber: number | null;
    section: string | null;
  }> = {},
): HybridSearchResult {
  return {
    chunk: {
      id: overrides.chunkId ?? "chunk-001",
      content: overrides.content ?? "The dragon lives in the mountain cave.",
      chunkIndex: 0,
      tokenCount: 10,
      pageNumber: "pageNumber" in overrides ? overrides.pageNumber ?? null : 1,
      section: "section" in overrides ? overrides.section ?? null : "Monsters",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    },
    score: overrides.score ?? 0.85,
    vectorScore: 0.9,
    keywordScore: 0.7,
    document: {
      id: overrides.documentId ?? "doc-001",
      name: overrides.documentName ?? "Monster Manual",
      documentType: (overrides.documentType ?? "rulebook") as "rulebook",
      metadata: {},
    },
  };
}

describe("Context Builder", () => {
  describe("estimateTokens", () => {
    it("should estimate tokens using ~4 chars per token", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 chars -> ceil(11/4) = 3
    });

    it("should return 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("should handle long strings", () => {
      const text = "a".repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });
  });

  describe("buildContext", () => {
    it("should build context from search results with citation markers", () => {
      const results = [
        makeSearchResult({ chunkId: "c1", content: "Dragons breathe fire.", score: 0.9 }),
        makeSearchResult({ chunkId: "c2", content: "Goblins are small.", score: 0.7 }),
      ];

      const context = buildContext(results);

      expect(context.chunksUsed).toBe(2);
      expect(context.sources).toHaveLength(2);
      expect(context.contextText).toContain("[1]");
      expect(context.contextText).toContain("[2]");
      expect(context.contextText).toContain("Dragons breathe fire.");
      expect(context.contextText).toContain("Goblins are small.");
    });

    it("should include document name and section in citation header", () => {
      const results = [
        makeSearchResult({
          content: "Some content",
          documentName: "Player Handbook",
          section: "Combat Rules",
          pageNumber: 42,
        }),
      ];

      const context = buildContext(results);

      expect(context.contextText).toContain("Player Handbook");
      expect(context.contextText).toContain("Combat Rules");
      expect(context.contextText).toContain("p. 42");
    });

    it("should respect maxTokens budget", () => {
      // Create a result with very long content
      const longContent = "word ".repeat(500); // ~2500 chars -> ~625 tokens
      const results = [
        makeSearchResult({ chunkId: "c1", content: longContent, score: 0.9 }),
        makeSearchResult({ chunkId: "c2", content: longContent, score: 0.8 }),
        makeSearchResult({ chunkId: "c3", content: longContent, score: 0.7 }),
      ];

      const context = buildContext(results, { maxTokens: 700 });

      // Should only include 1 chunk since each is ~625 tokens + header
      expect(context.chunksUsed).toBe(1);
      expect(context.sources).toHaveLength(1);
    });

    it("should filter out chunks below minRelevanceScore", () => {
      const results = [
        makeSearchResult({ chunkId: "c1", score: 0.8 }),
        makeSearchResult({ chunkId: "c2", score: 0.05 }),
        makeSearchResult({ chunkId: "c3", score: 0.02 }),
      ];

      const context = buildContext(results, { minRelevanceScore: 0.1 });

      expect(context.chunksUsed).toBe(1);
      expect(context.sources[0]?.documentName).toBe("Monster Manual");
    });

    it("should return empty context when no results provided", () => {
      const context = buildContext([]);

      expect(context.chunksUsed).toBe(0);
      expect(context.sources).toHaveLength(0);
      expect(context.contextText).toBe("");
      expect(context.estimatedTokens).toBe(0);
    });

    it("should return empty context when all results are below threshold", () => {
      const results = [
        makeSearchResult({ score: 0.01 }),
        makeSearchResult({ score: 0.05 }),
      ];

      const context = buildContext(results, { minRelevanceScore: 0.5 });

      expect(context.chunksUsed).toBe(0);
      expect(context.contextText).toBe("");
    });

    it("should order sources by their citation index", () => {
      const results = [
        makeSearchResult({ chunkId: "c1", score: 0.9, documentName: "Doc A" }),
        makeSearchResult({ chunkId: "c2", score: 0.8, documentName: "Doc B" }),
        makeSearchResult({ chunkId: "c3", score: 0.7, documentName: "Doc C" }),
      ];

      const context = buildContext(results);

      expect(context.sources[0]?.index).toBe(1);
      expect(context.sources[0]?.documentName).toBe("Doc A");
      expect(context.sources[1]?.index).toBe(2);
      expect(context.sources[1]?.documentName).toBe("Doc B");
      expect(context.sources[2]?.index).toBe(3);
      expect(context.sources[2]?.documentName).toBe("Doc C");
    });

    it("should separate chunks with --- dividers", () => {
      const results = [
        makeSearchResult({ chunkId: "c1", content: "First chunk." }),
        makeSearchResult({ chunkId: "c2", content: "Second chunk." }),
      ];

      const context = buildContext(results);

      expect(context.contextText).toContain("---");
    });

    it("should handle chunks without page number or section", () => {
      const results = [
        makeSearchResult({ content: "Some content", pageNumber: null, section: null }),
      ];

      const context = buildContext(results);

      expect(context.contextText).toContain("Monster Manual");
      expect(context.contextText).toContain("Some content");
      expect(context.contextText).not.toContain("p.");
    });

    it("should populate source citation fields correctly", () => {
      const results = [
        makeSearchResult({
          documentId: "doc-abc",
          documentName: "Setting Guide",
          documentType: "setting",
          pageNumber: 15,
          section: "Geography",
          score: 0.92,
        }),
      ];

      const context = buildContext(results);
      const source = context.sources[0]!;

      expect(source.documentId).toBe("doc-abc");
      expect(source.documentName).toBe("Setting Guide");
      expect(source.documentType).toBe("setting");
      expect(source.pageNumber).toBe(15);
      expect(source.section).toBe("Geography");
      expect(source.relevanceScore).toBe(0.92);
    });
  });
});
