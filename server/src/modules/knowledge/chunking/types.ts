// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Document Chunking Types
 *
 * Types for splitting documents into searchable chunks for embedding.
 */

import type { DocumentSection } from "@/modules/documents/processors/types.js";
import type { PdfPage } from "@/modules/documents/processors/types.js";

/**
 * Chunking strategy identifiers
 */
export type ChunkingStrategy = "fixed-size" | "semantic" | "markdown-aware";

/**
 * A chunk of document content with metadata for citation
 */
export interface DocumentChunk {
  /** The text content of the chunk */
  content: string;
  /** 0-indexed position of this chunk in the document */
  chunkIndex: number;
  /** Estimated token count for this chunk */
  tokenCount: number;
  /** Page number if from a paginated document (1-indexed) */
  pageNumber?: number;
  /** Section heading or name for citation */
  section?: string;
  /** Character offset where this chunk starts in the original document */
  startOffset: number;
  /** Character offset where this chunk ends in the original document */
  endOffset: number;
}

/**
 * Input for chunking a text document
 */
export interface TextChunkingInput {
  /** Full text content to chunk */
  content: string;
  /** Detected sections (optional, used by semantic/markdown strategies) */
  sections?: DocumentSection[];
}

/**
 * Input for chunking a PDF document
 */
export interface PdfChunkingInput {
  /** Full text content to chunk */
  content: string;
  /** Per-page content with offsets */
  pages: PdfPage[];
  /** Total number of pages */
  pageCount: number;
}

/**
 * Union type for chunking input
 */
export type ChunkingInput = TextChunkingInput | PdfChunkingInput;

/**
 * Configuration for fixed-size chunking
 */
export interface FixedSizeChunkingOptions {
  /** Target size in tokens (default: 512) */
  targetTokens?: number;
  /** Overlap in tokens between chunks (default: 100) */
  overlapTokens?: number;
  /** Minimum chunk size in tokens (default: 50) */
  minChunkTokens?: number;
}

/**
 * Configuration for semantic chunking
 */
export interface SemanticChunkingOptions {
  /** Maximum tokens per chunk (default: 1024) */
  maxTokens?: number;
  /** Minimum tokens per chunk before merging with next (default: 100) */
  minTokens?: number;
  /** Maximum heading level to split on (1-6, default: 3) */
  maxHeadingLevel?: number;
}

/**
 * Configuration for markdown-aware chunking
 */
export interface MarkdownChunkingOptions {
  /** Target size in tokens (default: 512) */
  targetTokens?: number;
  /** Overlap in tokens between chunks (default: 100) */
  overlapTokens?: number;
  /** Preserve code blocks intact when possible (default: true) */
  preserveCodeBlocks?: boolean;
  /** Preserve lists intact when possible (default: true) */
  preserveLists?: boolean;
}

/**
 * Combined chunking options
 */
export interface ChunkingOptions {
  /** Strategy to use (default: "fixed-size") */
  strategy?: ChunkingStrategy;
  /** Fixed-size strategy options */
  fixedSize?: FixedSizeChunkingOptions;
  /** Semantic strategy options */
  semantic?: SemanticChunkingOptions;
  /** Markdown-aware strategy options */
  markdown?: MarkdownChunkingOptions;
}

/**
 * Result of chunking a document
 */
export interface ChunkingResult {
  /** Generated chunks */
  chunks: DocumentChunk[];
  /** Strategy used */
  strategy: ChunkingStrategy;
  /** Total token count across all chunks */
  totalTokens: number;
  /** Average tokens per chunk */
  averageChunkTokens: number;
}

/**
 * Error codes for chunking operations
 */
export type ChunkingErrorCode =
  | "EMPTY_CONTENT"
  | "INVALID_OPTIONS"
  | "CHUNK_TOO_LARGE"
  | "PROCESSING_ERROR";

/**
 * Error returned from chunking operations
 */
export interface ChunkingError {
  code: ChunkingErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Chunking strategy interface
 */
export interface ChunkingStrategyHandler {
  /**
   * Split content into chunks
   * @param input - The content to chunk
   * @param options - Strategy-specific options
   */
  chunk(input: ChunkingInput, options?: ChunkingOptions): DocumentChunk[];
}
