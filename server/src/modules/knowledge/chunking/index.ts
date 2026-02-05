/**
 * Document Chunking Module
 *
 * Provides services for splitting documents into searchable chunks.
 */

export {
  createChunkingService,
  estimateTokenCount,
  chunkFixedSize,
  chunkSemantic,
  chunkMarkdownAware,
  type ChunkingService,
} from "./chunking.service.js";

export type {
  ChunkingStrategy,
  DocumentChunk,
  TextChunkingInput,
  PdfChunkingInput,
  ChunkingInput,
  FixedSizeChunkingOptions,
  SemanticChunkingOptions,
  MarkdownChunkingOptions,
  ChunkingOptions,
  ChunkingResult,
  ChunkingErrorCode,
  ChunkingError,
  ChunkingStrategyHandler,
} from "./types.js";
