/**
 * Document Indexing Job
 *
 * Background job that processes uploaded documents through the full
 * indexing pipeline:
 * 1. Download file from storage
 * 2. Extract text using the appropriate processor (PDF or text/markdown)
 * 3. Chunk content into searchable segments
 * 4. Generate embeddings for each chunk via Ollama
 * 5. Store chunks with embeddings in the database
 * 6. Update document status to "ready"
 *
 * On failure, cleans up any partially-inserted chunks and marks the
 * document as "failed" with the error message.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { chunks, type NewChunk } from "@/db/schema/chunks.js";
import { documents } from "@/db/schema/documents.js";
import { config } from "@/config/index.js";
import { createPdfProcessor } from "@/modules/documents/processors/pdf.js";
import { createTextProcessor } from "@/modules/documents/processors/text.js";
import { createChunkingService } from "@/modules/knowledge/chunking/service.js";
import { createStorageService } from "@/services/storage/index.js";
import {
  updateDocumentStatus,
  updateDocumentChunkCount,
  findDocumentById,
} from "@/modules/documents/repository.js";
import { registerHandler } from "./handlers/index.js";
import type { BaseJobData, JobContext } from "./types.js";
import type { ChunkingInput } from "@/modules/knowledge/chunking/types.js";

// ============================================================================
// Types
// ============================================================================

/** Data required to process a document */
export interface DocumentIndexingJobData extends BaseJobData {
  documentId: string;
  campaignId: string;
}

/** Ollama embed API response */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

// ============================================================================
// Constants
// ============================================================================

/** Embedding model matching the 768-dimension chunks table */
const EMBEDDING_MODEL = "nomic-embed-text";

/** Maximum number of texts to embed in a single API call */
const EMBEDDING_BATCH_SIZE = 20;

/** Timeout per embedding request (ms) */
const EMBEDDING_TIMEOUT = 120_000;

/** MIME types handled by the PDF processor */
const PDF_MIME_TYPES = new Set(["application/pdf"]);

/** MIME types handled by the text processor */
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
]);

// ============================================================================
// Embedding Helper
// ============================================================================

/**
 * Generate embeddings for a batch of texts using the Ollama embed API.
 *
 * Calls POST /api/embed with the `input` array format.
 */
async function generateEmbeddings(
  texts: string[],
  signal: AbortSignal,
): Promise<number[][]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);

  // Abort on both timeout and external signal
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${config.llm.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Embedding request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    return data.embeddings;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onAbort);
  }
}

// ============================================================================
// Processing Pipeline Stages
// ============================================================================

/**
 * Stage 1: Extract text from the document using the appropriate processor.
 */
async function extractText(
  campaignId: string,
  documentId: string,
  mimeType: string,
) {
  const storage = createStorageService();

  if (PDF_MIME_TYPES.has(mimeType)) {
    const processor = createPdfProcessor({ storage });
    const result = await processor.process(campaignId, documentId);
    if (!result.ok) {
      throw new Error(`PDF extraction failed: ${result.error.message}`);
    }
    return {
      content: result.value.content,
      chunkingInput: {
        content: result.value.content,
        pages: result.value.pages,
        pageCount: result.value.pageCount,
      } as ChunkingInput,
      metadata: {
        pageCount: result.value.pageCount,
        extractedText: result.value.hasExtractedText,
      },
    };
  }

  if (TEXT_MIME_TYPES.has(mimeType)) {
    const processor = createTextProcessor({ storage });
    const result = await processor.process(campaignId, documentId);
    if (!result.ok) {
      throw new Error(`Text extraction failed: ${result.error.message}`);
    }
    return {
      content: result.value.content,
      chunkingInput: {
        content: result.value.content,
        sections: result.value.sections,
      } as ChunkingInput,
      metadata: {
        extractedText: true,
      },
    };
  }

  throw new Error(`Unsupported MIME type for indexing: ${mimeType}`);
}

/**
 * Stage 2: Chunk the extracted text.
 */
function chunkContent(input: ChunkingInput) {
  const chunker = createChunkingService();
  const result = chunker.chunk(input);
  if (!result.ok) {
    throw new Error(`Chunking failed: ${result.error.message}`);
  }
  return result.value;
}

/**
 * Stage 3: Generate embeddings for all chunks in batches.
 */
async function embedChunks(
  chunkTexts: string[],
  signal: AbortSignal,
  onBatchComplete: (completed: number, total: number) => Promise<void>,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const total = chunkTexts.length;

  for (let i = 0; i < total; i += EMBEDDING_BATCH_SIZE) {
    if (signal.aborted) {
      throw new Error("Job cancelled");
    }

    const batch = chunkTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await generateEmbeddings(batch, signal);
    allEmbeddings.push(...batchEmbeddings);

    await onBatchComplete(allEmbeddings.length, total);
  }

  return allEmbeddings;
}

/**
 * Stage 4: Store chunks with embeddings in the database.
 */
async function storeChunks(
  documentId: string,
  campaignId: string,
  chunkData: Array<{
    content: string;
    chunkIndex: number;
    tokenCount: number;
    pageNumber?: number;
    section?: string;
    embedding: number[];
  }>,
): Promise<number> {
  if (chunkData.length === 0) return 0;

  const rows: NewChunk[] = chunkData.map((c) => ({
    documentId,
    campaignId,
    content: c.content,
    embedding: c.embedding,
    chunkIndex: c.chunkIndex,
    tokenCount: c.tokenCount,
    pageNumber: c.pageNumber ?? null,
    section: c.section ?? null,
  }));

  // Insert in batches of 100 to avoid oversized queries
  const INSERT_BATCH = 100;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    await db.insert(chunks).values(batch);
  }

  return rows.length;
}

/**
 * Clean up chunks for a document (used on failure).
 */
async function deleteDocumentChunks(documentId: string): Promise<void> {
  await db.delete(chunks).where(eq(chunks.documentId, documentId));
}

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Main document indexing handler.
 *
 * Orchestrates the full pipeline and reports progress through the job context.
 */
async function handleDocumentIndexing(
  data: DocumentIndexingJobData,
  context: JobContext,
): Promise<void> {
  const { documentId, campaignId } = data;

  context.logger.info("Starting document indexing", { documentId, campaignId });

  // ---- Validate document exists and is in a processable state ----
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  // Mark document as processing
  await updateDocumentStatus(documentId, "processing");

  try {
    // ---- Stage 1: Extract text (0 → 20%) ----
    await context.updateProgress({
      percentage: 0,
      message: "Extracting text from document",
      metadata: { stage: "extraction" },
    });

    if (context.signal.aborted) throw new Error("Job cancelled");

    const extracted = await extractText(
      campaignId,
      documentId,
      document.mimeType,
    );

    // Persist extraction metadata on the document
    await db
      .update(documents)
      .set({
        metadata: {
          ...(document.metadata as Record<string, unknown> | null),
          ...extracted.metadata,
        },
      })
      .where(eq(documents.id, documentId));

    await context.updateProgress({
      percentage: 20,
      message: "Text extracted successfully",
      metadata: { stage: "extraction" },
    });

    context.logger.info("Text extraction complete", {
      documentId,
      contentLength: extracted.content.length,
    });

    // ---- Stage 2: Chunk content (20 → 35%) ----
    if (context.signal.aborted) throw new Error("Job cancelled");

    await context.updateProgress({
      percentage: 20,
      message: "Chunking document content",
      metadata: { stage: "chunking" },
    });

    const chunkingResult = chunkContent(extracted.chunkingInput);

    await context.updateProgress({
      percentage: 35,
      message: `Document split into ${chunkingResult.chunks.length} chunks`,
      metadata: {
        stage: "chunking",
        chunkCount: chunkingResult.chunks.length,
        strategy: chunkingResult.strategy,
      },
    });

    context.logger.info("Chunking complete", {
      documentId,
      chunkCount: chunkingResult.chunks.length,
      strategy: chunkingResult.strategy,
      totalTokens: chunkingResult.totalTokens,
    });

    // ---- Stage 3: Generate embeddings (35 → 85%) ----
    if (context.signal.aborted) throw new Error("Job cancelled");

    await context.updateProgress({
      percentage: 35,
      message: "Generating embeddings",
      metadata: { stage: "embedding" },
    });

    const chunkTexts = chunkingResult.chunks.map((c) => c.content);
    const embeddings = await embedChunks(
      chunkTexts,
      context.signal,
      async (completed, total) => {
        // Map embedding progress to 35–85% range
        const pct = 35 + Math.round((completed / total) * 50);
        await context.updateProgress({
          percentage: pct,
          message: `Generated embeddings for ${completed}/${total} chunks`,
          metadata: { stage: "embedding", completed, total },
        });
      },
    );

    context.logger.info("Embedding generation complete", {
      documentId,
      embeddingCount: embeddings.length,
    });

    // ---- Stage 4: Store chunks (85 → 95%) ----
    if (context.signal.aborted) throw new Error("Job cancelled");

    await context.updateProgress({
      percentage: 85,
      message: "Storing chunks in database",
      metadata: { stage: "storage" },
    });

    const chunkRows = chunkingResult.chunks.map((c, i) => {
      const row: {
        content: string;
        chunkIndex: number;
        tokenCount: number;
        pageNumber?: number;
        section?: string;
        embedding: number[];
      } = {
        content: c.content,
        chunkIndex: c.chunkIndex,
        tokenCount: c.tokenCount,
        embedding: embeddings[i]!,
      };
      if (c.pageNumber !== undefined) row.pageNumber = c.pageNumber;
      if (c.section !== undefined) row.section = c.section;
      return row;
    });

    const storedCount = await storeChunks(documentId, campaignId, chunkRows);

    await context.updateProgress({
      percentage: 95,
      message: `Stored ${storedCount} chunks`,
      metadata: { stage: "storage", storedCount },
    });

    context.logger.info("Chunks stored", { documentId, storedCount });

    // ---- Stage 5: Finalise document status (95 → 100%) ----
    await db
      .update(documents)
      .set({
        metadata: {
          ...(document.metadata as Record<string, unknown> | null),
          ...extracted.metadata,
          embeddingsGenerated: true,
        },
      })
      .where(eq(documents.id, documentId));

    await updateDocumentChunkCount(documentId, storedCount);

    await context.updateProgress({
      percentage: 100,
      message: "Document indexing complete",
      metadata: { stage: "complete" },
    });

    context.logger.info("Document indexing complete", {
      documentId,
      chunkCount: storedCount,
    });
  } catch (error) {
    // ---- Failure: clean up and mark document as failed ----
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error during indexing";

    context.logger.error("Document indexing failed, cleaning up", {
      documentId,
      error: errorMessage,
    });

    // Remove any chunks that were partially inserted
    try {
      await deleteDocumentChunks(documentId);
    } catch (cleanupError) {
      context.logger.error("Failed to clean up chunks after error", {
        documentId,
        cleanupError:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
    }

    // Mark document as failed with the error message
    await updateDocumentStatus(documentId, "failed", errorMessage);

    // Re-throw so BullMQ records the failure and can retry
    throw error;
  }
}

// ============================================================================
// Handler Registration
// ============================================================================

registerHandler<DocumentIndexingJobData, void>({
  queueName: "document-indexing",
  handler: handleDocumentIndexing,
  description:
    "Processes uploaded documents: extracts text, chunks content, generates embeddings, and stores results for retrieval",
});

export { handleDocumentIndexing };
