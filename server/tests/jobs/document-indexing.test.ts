// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { ok, err } from "../../src/types/index.js";
import type { JobContext, JobLogger } from "../../src/jobs/types.js";

// ============================================================================
// Mock setup — all external dependencies are mocked before the SUT is imported
// ============================================================================

// -- DB -----------------------------------------------------------------------
const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSet = vi.fn();
const mockDbWhere = vi.fn();
const mockDbValues = vi.fn();

vi.mock("@/db/index.js", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return { values: (...vArgs: unknown[]) => { mockDbValues(...vArgs); return Promise.resolve(); } };
    },
    delete: (...args: unknown[]) => {
      mockDbDelete(...args);
      return { where: (...wArgs: unknown[]) => { mockDbWhere(...wArgs); return Promise.resolve(); } };
    },
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockDbSet(...sArgs);
          return { where: (...wArgs: unknown[]) => { mockDbWhere(...wArgs); return Promise.resolve(); } };
        },
      };
    },
  },
}));

vi.mock("@/db/schema/chunks.js", () => ({
  chunks: { documentId: "chunks.documentId" },
}));

vi.mock("@/db/schema/documents.js", () => ({
  documents: { id: "documents.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
}));

// -- Repository ---------------------------------------------------------------
const mockFindDocumentById = vi.fn();
const mockUpdateDocumentStatus = vi.fn().mockResolvedValue(null);
const mockUpdateDocumentChunkCount = vi.fn().mockResolvedValue(null);

vi.mock("@/modules/documents/repository.js", () => ({
  findDocumentById: (...args: unknown[]) => mockFindDocumentById(...args),
  updateDocumentStatus: (...args: unknown[]) => mockUpdateDocumentStatus(...args),
  updateDocumentChunkCount: (...args: unknown[]) => mockUpdateDocumentChunkCount(...args),
}));

// -- Processors ---------------------------------------------------------------
const mockPdfProcess = vi.fn();
const mockTextProcess = vi.fn();

vi.mock("@/modules/documents/processors/pdf.js", () => ({
  createPdfProcessor: () => ({ process: mockPdfProcess }),
}));

vi.mock("@/modules/documents/processors/text.js", () => ({
  createTextProcessor: () => ({ process: mockTextProcess }),
}));

// -- Chunking -----------------------------------------------------------------
const mockChunk = vi.fn();

vi.mock("@/modules/knowledge/chunking/service.js", () => ({
  createChunkingService: () => ({
    chunk: mockChunk,
    estimateTokens: (t: string) => Math.ceil(t.length / 4),
  }),
}));

// -- Storage ------------------------------------------------------------------
vi.mock("@/services/storage/index.js", () => ({
  createStorageService: () => ({}),
}));

// -- Config -------------------------------------------------------------------
vi.mock("@/config/index.js", () => ({
  config: {
    llm: { baseUrl: "http://localhost:11434" },
  },
}));

vi.mock("@/services/metrics/service.js", () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  trackTimed: vi.fn(),
  isMetricsEnabled: vi.fn(() => false),
  shutdownMetrics: vi.fn(),
}));

// -- Handler registry (prevent side-effect registration) ----------------------
vi.mock("../../src/jobs/handlers/index.js", () => ({
  registerHandler: vi.fn(),
}));

// -- Global fetch mock --------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ============================================================================
// Helpers
// ============================================================================

function createMockLogger(): JobLogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createMockContext(overrides?: Partial<JobContext>): JobContext {
  return {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    logger: createMockLogger(),
    signal: new AbortController().signal,
    job: { id: "job-1" } as JobContext["job"],
    ...overrides,
  };
}

/** A minimal document record returned by findDocumentById */
function fakeDocument(overrides?: Record<string, unknown>) {
  return {
    id: "doc-1",
    campaignId: "camp-1",
    mimeType: "text/plain",
    name: "notes.txt",
    metadata: {},
    ...overrides,
  };
}

/** Build a fake chunking result */
function fakeChunkingResult(count = 2) {
  return ok({
    chunks: Array.from({ length: count }, (_, i) => ({
      content: `chunk-${i}`,
      chunkIndex: i,
      tokenCount: 10,
      startOffset: i * 100,
      endOffset: (i + 1) * 100,
    })),
    strategy: "fixed-size" as const,
    totalTokens: count * 10,
    averageChunkTokens: 10,
  });
}

/** Build a fake embeddings fetch response */
function fakeEmbeddingResponse(count: number) {
  const embeddings = Array.from({ length: count }, () =>
    Array.from({ length: 1024 }, () => Math.random()),
  );
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
    json: () => Promise.resolve({ embeddings }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Document Indexing Job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbValues.mockImplementation(() => Promise.resolve());
  });

  // Import the handler fresh — mocks are already in place via vi.mock
  async function getHandler() {
    const mod = await import("../../src/jobs/document-indexing.js");
    return mod.handleDocumentIndexing;
  }

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------
  describe("successful processing", () => {
    it("processes a text document end-to-end", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({
          content: "Hello world",
          sections: [],
          characterCount: 11,
          tokenCount: 3,
          encoding: "utf-8",
        }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(2));
      mockFetch.mockResolvedValue(fakeEmbeddingResponse(2));

      await handler(
        { documentId: "doc-1", campaignId: "camp-1" },
        context,
      );

      // Status transitions: processing → ready (via updateDocumentChunkCount)
      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith("doc-1", "processing");
      expect(mockUpdateDocumentChunkCount).toHaveBeenCalledWith("doc-1", 2);

      // Progress reached 100%
      expect(context.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percentage: 100 }),
      );
    });

    it("processes a PDF document end-to-end", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(
        fakeDocument({ mimeType: "application/pdf" }),
      );
      mockPdfProcess.mockResolvedValue(
        ok({
          content: "Page 1 text",
          pages: [{ pageNumber: 1, content: "Page 1 text", startOffset: 0, endOffset: 11 }],
          pageCount: 1,
          metadata: { pageCount: 1 },
          characterCount: 11,
          tokenCount: 3,
          hasExtractedText: true,
        }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(1));
      mockFetch.mockResolvedValue(fakeEmbeddingResponse(1));

      await handler(
        { documentId: "doc-1", campaignId: "camp-1" },
        context,
      );

      expect(mockPdfProcess).toHaveBeenCalledWith("camp-1", "doc-1");
      expect(mockUpdateDocumentChunkCount).toHaveBeenCalledWith("doc-1", 1);
    });

    it("reports progress at each pipeline stage", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "text", sections: [], characterCount: 4, tokenCount: 1, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(1));
      mockFetch.mockResolvedValue(fakeEmbeddingResponse(1));

      await handler({ documentId: "doc-1", campaignId: "camp-1" }, context);

      const progressCalls = (context.updateProgress as Mock).mock.calls.map(
        (c: unknown[]) => (c[0] as { percentage: number; metadata?: { stage?: string } }),
      );

      // Verify we hit all stages
      const stages = progressCalls
        .filter((p) => p.metadata?.stage)
        .map((p) => p.metadata!.stage);
      expect(stages).toContain("extraction");
      expect(stages).toContain("chunking");
      expect(stages).toContain("embedding");
      expect(stages).toContain("storage");
      expect(stages).toContain("complete");

      // Final progress is 100%
      const last = progressCalls[progressCalls.length - 1];
      expect(last?.percentage).toBe(100);
    });

    it("sends embeddings in batches and reports per-batch progress", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      // 25 chunks → 2 batches (20 + 5)
      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "text", sections: [], characterCount: 4, tokenCount: 1, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(25));

      // First batch: 20, second batch: 5
      mockFetch
        .mockResolvedValueOnce(fakeEmbeddingResponse(20))
        .mockResolvedValueOnce(fakeEmbeddingResponse(5));

      await handler({ documentId: "doc-1", campaignId: "camp-1" }, context);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockUpdateDocumentChunkCount).toHaveBeenCalledWith("doc-1", 25);
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------
  describe("error handling", () => {
    it("throws and marks failed when document not found", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(null);

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("not found");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("not found"),
      );
    });

    it("throws and marks failed for unsupported MIME type", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(
        fakeDocument({ mimeType: "image/png" }),
      );

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("Unsupported MIME type");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("Unsupported MIME type"),
      );
    });

    it("throws and marks failed when text extraction fails", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        err({ code: "STORAGE_ERROR", message: "File not found" }),
      );

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("extraction failed");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("extraction failed"),
      );
    });

    it("throws and marks failed when chunking fails", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "", sections: [], characterCount: 0, tokenCount: 0, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(
        err({ code: "EMPTY_CONTENT", message: "Document content is empty" }),
      );

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("Chunking failed");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("Chunking failed"),
      );
    });

    it("throws and marks failed when embedding API returns error", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "text", sections: [], characterCount: 4, tokenCount: 1, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(1));
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
        json: () => Promise.resolve({}),
      });

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("Embedding request failed");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("Embedding request failed"),
      );
    });

    it("throws and marks failed when db insert fails", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "text", sections: [], characterCount: 4, tokenCount: 1, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(1));
      mockFetch.mockResolvedValue(fakeEmbeddingResponse(1));
      mockDbValues.mockImplementation(() => { throw new Error("DB connection lost"); });

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("DB connection lost");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("DB connection lost"),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Cleanup on failure
  // --------------------------------------------------------------------------
  describe("cleanup on failure", () => {
    it("deletes orphaned chunks when pipeline fails", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        ok({ content: "text", sections: [], characterCount: 4, tokenCount: 1, encoding: "utf-8" }),
      );
      mockChunk.mockReturnValue(fakeChunkingResult(1));
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service unavailable"),
        json: () => Promise.resolve({}),
      });

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow();

      // Verify delete was called for cleanup
      expect(mockDbDelete).toHaveBeenCalled();
    });

    it("logs warning when chunk cleanup itself fails", async () => {
      const handler = await getHandler();
      const context = createMockContext();

      mockFindDocumentById.mockResolvedValue(fakeDocument());
      mockTextProcess.mockResolvedValue(
        err({ code: "STORAGE_ERROR", message: "download failed" }),
      );

      // Make the delete (cleanup) throw
      mockDbDelete.mockImplementationOnce(() => {
        throw new Error("cleanup failed");
      });

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow();

      // Should still mark as failed despite cleanup error
      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.any(String),
      );
      // Should log the cleanup failure
      expect(context.logger.error).toHaveBeenCalledWith(
        "Failed to clean up chunks after error",
        expect.objectContaining({ documentId: "doc-1" }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Cancellation
  // --------------------------------------------------------------------------
  describe("cancellation", () => {
    it("respects abort signal before extraction", async () => {
      const handler = await getHandler();
      const controller = new AbortController();
      controller.abort();
      const context = createMockContext({ signal: controller.signal });

      mockFindDocumentById.mockResolvedValue(fakeDocument());

      await expect(
        handler({ documentId: "doc-1", campaignId: "camp-1" }, context),
      ).rejects.toThrow("cancelled");

      expect(mockUpdateDocumentStatus).toHaveBeenCalledWith(
        "doc-1", "failed", expect.stringContaining("cancelled"),
      );
      // Should not have attempted extraction
      expect(mockTextProcess).not.toHaveBeenCalled();
    });
  });
});
