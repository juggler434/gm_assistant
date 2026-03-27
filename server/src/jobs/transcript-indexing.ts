// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Transcript Indexing Job
 *
 * Background job that indexes a session transcript for RAG search:
 * 1. Load transcript and session metadata from DB
 * 2. Create a "transcript" document record
 * 3. Chunk transcript segments (preserving speaker labels and timestamps)
 * 4. Generate embeddings for each chunk
 * 5. Store chunks with embeddings in the database
 * 6. Update document status to "ready"
 *
 * Triggered automatically after session transcription completes.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { chunks, type NewChunk } from "@/db/schema/chunks.js";
import { documents } from "@/db/schema/documents.js";
import {
  generateEmbeddings,
  EMBEDDING_BATCH_SIZE,
  type EmbeddingError,
} from "@/services/llm/index.js";
import {
  findTranscriptBySessionId,
  findSessionByIdAndCampaignId,
} from "@/modules/sessions/repository.js";
import {
  updateDocumentStatus,
  updateDocumentChunkCount,
  createDocument,
} from "@/modules/documents/repository.js";
import { trackEvent } from "@/services/metrics/index.js";
import { registerHandler } from "./handlers/index.js";
import type { BaseJobData, JobContext } from "./types.js";
import type { TranscriptSegment } from "@gm-assistant/shared";

// ============================================================================
// Types
// ============================================================================

export interface TranscriptIndexingJobData extends BaseJobData {
  sessionId: string;
  campaignId: string;
  userId: string;
}

interface TranscriptChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  section: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Target tokens per chunk (~4 chars per token) */
const TARGET_CHUNK_TOKENS = 256;
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;

/** Minimum chunk size to avoid tiny fragments */
const MIN_CHUNK_CHARS = 120;

// ============================================================================
// Transcript Chunking
// ============================================================================

/**
 * Format seconds into HH:MM:SS string.
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a segment with speaker label.
 */
function formatSegment(segment: TranscriptSegment): string {
  const speaker = segment.speaker === "unknown" ? "Speaker" : segment.speaker;
  return `${speaker}: ${segment.text.trim()}`;
}

/**
 * Chunk transcript segments into RAG-ready chunks, preserving speaker
 * labels and timestamp ranges.
 */
export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
): TranscriptChunk[] {
  if (segments.length === 0) return [];

  const results: TranscriptChunk[] = [];
  let currentLines: string[] = [];
  let currentChars = 0;
  let chunkStartTime = segments[0]!.startTime;
  let chunkEndTime = segments[0]!.endTime;

  for (const segment of segments) {
    const line = formatSegment(segment);
    const lineChars = line.length + 1; // +1 for newline

    // If adding this segment would exceed the target and we have content, flush
    if (currentChars + lineChars > TARGET_CHUNK_CHARS && currentChars >= MIN_CHUNK_CHARS) {
      results.push({
        content: currentLines.join("\n"),
        chunkIndex: results.length,
        tokenCount: Math.ceil(currentChars / CHARS_PER_TOKEN),
        section: `${formatTimestamp(chunkStartTime)} - ${formatTimestamp(chunkEndTime)}`,
      });

      currentLines = [];
      currentChars = 0;
      chunkStartTime = segment.startTime;
    }

    currentLines.push(line);
    currentChars += lineChars;
    chunkEndTime = segment.endTime;
  }

  // Flush remaining content
  if (currentLines.length > 0) {
    results.push({
      content: currentLines.join("\n"),
      chunkIndex: results.length,
      tokenCount: Math.ceil(currentChars / CHARS_PER_TOKEN),
      section: `${formatTimestamp(chunkStartTime)} - ${formatTimestamp(chunkEndTime)}`,
    });
  }

  return results;
}

/**
 * Chunk plain transcript text (fallback when segments are empty).
 * Uses simple paragraph-based splitting.
 */
function chunkTranscriptText(text: string): TranscriptChunk[] {
  if (!text.trim()) return [];

  const results: TranscriptChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + TARGET_CHUNK_CHARS, text.length);

    // Try to break at a natural boundary
    if (end < text.length) {
      const searchStart = Math.max(start + MIN_CHUNK_CHARS, end - 200);
      const slice = text.slice(searchStart, end);
      const breakPoints = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" "),
      ];
      for (const bp of breakPoints) {
        if (bp !== -1) {
          end = searchStart + bp + 1;
          break;
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length >= MIN_CHUNK_CHARS || results.length === 0) {
      results.push({
        content,
        chunkIndex: results.length,
        tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
        section: `Chunk ${results.length + 1}`,
      });
    } else if (results.length > 0) {
      // Merge small trailing content into the last chunk
      const last = results[results.length - 1]!;
      last.content += "\n" + content;
      last.tokenCount = Math.ceil(last.content.length / CHARS_PER_TOKEN);
    }

    start = end;
  }

  return results;
}

// ============================================================================
// Embedding Helper
// ============================================================================

async function embedChunks(
  chunkTexts: string[],
  signal: AbortSignal,
  onBatchComplete: (completed: number, total: number) => Promise<void>,
): Promise<{ ok: true; value: number[][] } | { ok: false; error: EmbeddingError }> {
  const allEmbeddings: number[][] = [];
  const total = chunkTexts.length;

  for (let i = 0; i < total; i += EMBEDDING_BATCH_SIZE) {
    if (signal.aborted) {
      return { ok: false, error: { code: "CANCELLED", message: "Job cancelled" } };
    }

    const batch = chunkTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const result = await generateEmbeddings(batch, signal);
    if (!result.ok) {
      return result;
    }
    allEmbeddings.push(...result.value);

    await onBatchComplete(allEmbeddings.length, total);
  }

  return { ok: true, value: allEmbeddings };
}

// ============================================================================
// Job Handler
// ============================================================================

async function handleTranscriptIndexing(
  data: TranscriptIndexingJobData,
  context: JobContext,
): Promise<void> {
  const { sessionId, campaignId, userId } = data;
  const startTime = Date.now();

  context.logger.info("Starting transcript indexing", { sessionId, campaignId });

  // ---- Load transcript and session ----
  await context.updateProgress({
    percentage: 0,
    message: "Loading transcript",
    metadata: { stage: "load" },
  });

  const [transcript, session] = await Promise.all([
    findTranscriptBySessionId(sessionId),
    findSessionByIdAndCampaignId(sessionId, campaignId),
  ]);

  if (!transcript) {
    context.logger.error("Transcript not found", { sessionId });
    throw new Error(`Transcript not found for session ${sessionId}`);
  }

  if (!session) {
    context.logger.error("Session not found", { sessionId, campaignId });
    throw new Error(`Session ${sessionId} not found`);
  }

  // ---- Check for existing transcript document and remove it (dedup) ----
  await context.updateProgress({
    percentage: 5,
    message: "Checking for existing transcript document",
    metadata: { stage: "dedup" },
  });

  const existingDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.campaignId, campaignId),
        eq(documents.documentType, "transcript"),
        sql`${documents.metadata}->>'sessionId' = ${sessionId}`,
      ),
    );

  for (const doc of existingDocs) {
    await db.delete(chunks).where(eq(chunks.documentId, doc.id));
    await db.delete(documents).where(eq(documents.id, doc.id));
    context.logger.info("Removed existing transcript document", { documentId: doc.id });
  }

  // ---- Create document record ----
  await context.updateProgress({
    percentage: 10,
    message: "Creating transcript document",
    metadata: { stage: "create" },
  });

  const sessionDate = session.date.toISOString();
  const document = await createDocument({
    campaignId,
    uploadedBy: userId,
    name: `Session: ${session.title}`,
    originalFilename: `transcript-${sessionId}.txt`,
    mimeType: "text/plain",
    fileSize: Buffer.byteLength(transcript.content, "utf-8"),
    storagePath: "",
    documentType: "transcript",
    tags: ["transcript", "session"],
    metadata: {
      sessionId,
      sessionTitle: session.title,
      sessionDate,
    },
    status: "processing",
  });

  if (!document) {
    context.logger.error("Failed to create transcript document", { sessionId });
    throw new Error("Failed to create transcript document");
  }

  const documentId = document.id;

  context.logger.info("Transcript document created", { documentId, sessionId });

  // ---- Chunk transcript ----
  await context.updateProgress({
    percentage: 15,
    message: "Chunking transcript",
    metadata: { stage: "chunking" },
  });

  const segments = (transcript.segments ?? []) as TranscriptSegment[];
  const transcriptChunks =
    segments.length > 0
      ? chunkTranscriptSegments(segments)
      : chunkTranscriptText(transcript.content);

  if (transcriptChunks.length === 0) {
    context.logger.warn("No chunks produced from transcript", { sessionId });
    await updateDocumentStatus(documentId, "ready");
    await updateDocumentChunkCount(documentId, 0);
    return;
  }

  await context.updateProgress({
    percentage: 25,
    message: `Transcript split into ${transcriptChunks.length} chunks`,
    metadata: { stage: "chunking", chunkCount: transcriptChunks.length },
  });

  context.logger.info("Transcript chunked", {
    sessionId,
    chunkCount: transcriptChunks.length,
    hasSegments: segments.length > 0,
  });

  // ---- Generate embeddings (25 → 80%) ----
  if (context.signal.aborted) {
    await updateDocumentStatus(documentId, "failed", "Job cancelled");
    throw new Error("Job cancelled");
  }

  await context.updateProgress({
    percentage: 25,
    message: "Generating embeddings",
    metadata: { stage: "embedding" },
  });

  const chunkTexts = transcriptChunks.map((c) => c.content);
  const embeddingResult = await embedChunks(
    chunkTexts,
    context.signal,
    async (completed, total) => {
      const pct = 25 + Math.round((completed / total) * 55);
      await context.updateProgress({
        percentage: pct,
        message: `Generated embeddings for ${completed}/${total} chunks`,
        metadata: { stage: "embedding", completed, total },
      });
    },
  );

  if (!embeddingResult.ok) {
    await updateDocumentStatus(documentId, "failed", embeddingResult.error.message);
    throw new Error(`Embedding failed: ${embeddingResult.error.message}`);
  }

  const embeddings = embeddingResult.value;

  context.logger.info("Embeddings generated", {
    sessionId,
    embeddingCount: embeddings.length,
  });

  // ---- Store chunks (80 → 95%) ----
  if (context.signal.aborted) {
    await updateDocumentStatus(documentId, "failed", "Job cancelled");
    throw new Error("Job cancelled");
  }

  await context.updateProgress({
    percentage: 80,
    message: "Storing chunks",
    metadata: { stage: "storage" },
  });

  const rows: NewChunk[] = transcriptChunks.map((c, i) => ({
    documentId,
    campaignId,
    content: c.content,
    embedding: embeddings[i]!,
    chunkIndex: c.chunkIndex,
    tokenCount: c.tokenCount,
    pageNumber: null,
    section: c.section,
  }));

  const INSERT_BATCH = 100;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    await db.insert(chunks).values(batch);
  }

  await context.updateProgress({
    percentage: 95,
    message: `Stored ${rows.length} chunks`,
    metadata: { stage: "storage", storedCount: rows.length },
  });

  context.logger.info("Chunks stored", { documentId, storedCount: rows.length });

  // ---- Finalize ----
  await db
    .update(documents)
    .set({
      metadata: {
        ...(document.metadata as Record<string, unknown> | null),
        embeddingsGenerated: true,
      },
    })
    .where(eq(documents.id, documentId));

  await updateDocumentChunkCount(documentId, rows.length);
  await updateDocumentStatus(documentId, "ready");

  await context.updateProgress({
    percentage: 100,
    message: "Transcript indexing complete",
    metadata: { stage: "complete" },
  });

  const durationMs = Date.now() - startTime;

  trackEvent("system", "transcript_indexing_completed", {
    session_id: sessionId,
    campaign_id: campaignId,
    document_id: documentId,
    chunk_count: rows.length,
    has_segments: segments.length > 0,
    processing_duration_ms: durationMs,
  });

  context.logger.info("Transcript indexing complete", {
    sessionId,
    documentId,
    chunkCount: rows.length,
    processingDurationMs: durationMs,
  });
}

// ============================================================================
// Handler Registration
// ============================================================================

registerHandler<TranscriptIndexingJobData, void>({
  queueName: "transcript-indexing",
  handler: handleTranscriptIndexing,
  description:
    "Indexes session transcripts for RAG search: chunks content, generates embeddings, and stores results",
});

export { handleTranscriptIndexing };
