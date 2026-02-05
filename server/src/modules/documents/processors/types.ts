/**
 * Document Processor Types
 */

import type { Result } from "@/types/index.js";

/**
 * A detected section within a document
 */
export interface DocumentSection {
  /** Section heading text (empty for content before first heading) */
  heading: string;
  /** Heading level (1-6 for markdown headers, 0 for no heading) */
  level: number;
  /** Section content (including nested content) */
  content: string;
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Ending line number (1-indexed, inclusive) */
  endLine: number;
}

/**
 * Result of processing a text/markdown document
 */
export interface TextProcessorResult {
  /** The full text content of the document */
  content: string;
  /** Detected sections in the document */
  sections: DocumentSection[];
  /** Total character count */
  characterCount: number;
  /** Estimated token count */
  tokenCount: number;
  /** Original encoding (always UTF-8 after processing) */
  encoding: string;
}

/**
 * Error codes for text processing
 */
export type TextProcessorErrorCode =
  | "STORAGE_ERROR"
  | "ENCODING_ERROR"
  | "EMPTY_FILE"
  | "PARSE_ERROR";

/**
 * Error returned from text processor
 */
export interface TextProcessorError {
  code: TextProcessorErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Options for text processing
 */
export interface TextProcessorOptions {
  /** Whether to detect sections (default: true for markdown, false for plain text) */
  detectSections?: boolean;
}

// ============================================================================
// PDF Processor Types
// ============================================================================

/**
 * A page of extracted text from a PDF
 */
export interface PdfPage {
  /** 1-indexed page number */
  pageNumber: number;
  /** Text content of the page */
  content: string;
  /** Character offset where this page starts in the full content */
  startOffset: number;
  /** Character offset where this page ends in the full content */
  endOffset: number;
}

/**
 * Metadata extracted from a PDF document
 */
export interface PdfMetadata {
  /** PDF title from document info */
  title?: string;
  /** PDF author from document info */
  author?: string;
  /** PDF subject from document info */
  subject?: string;
  /** PDF keywords from document info */
  keywords?: string;
  /** PDF creator application from document info */
  creator?: string;
  /** PDF producer from document info */
  producer?: string;
  /** PDF creation date */
  creationDate?: Date;
  /** PDF modification date */
  modificationDate?: Date;
  /** Total number of pages */
  pageCount: number;
  /** PDF version (e.g., "1.7") */
  pdfVersion?: string;
}

/**
 * Result of processing a PDF document
 */
export interface PdfProcessorResult {
  /** The full text content with page delimiters */
  content: string;
  /** Per-page content with character offsets */
  pages: PdfPage[];
  /** Total number of pages */
  pageCount: number;
  /** Metadata extracted from PDF */
  metadata: PdfMetadata;
  /** Total character count */
  characterCount: number;
  /** Estimated token count */
  tokenCount: number;
  /** Whether text was successfully extracted (false = likely scanned PDF) */
  hasExtractedText: boolean;
}

/**
 * Error codes for PDF processing
 */
export type PdfProcessorErrorCode =
  | "STORAGE_ERROR"
  | "INVALID_PDF"
  | "ENCRYPTED_PDF"
  | "CORRUPTED_PDF"
  | "EMPTY_PDF"
  | "PARSE_ERROR";

/**
 * Error returned from PDF processor
 */
export interface PdfProcessorError {
  code: PdfProcessorErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Options for PDF processing
 */
export interface PdfProcessorOptions {
  /** Delimiter between pages (default: "\n\n--- Page {n} ---\n\n") */
  pageDelimiter?: string;
  /** Maximum pages to process (0 = all pages, default: 0) */
  maxPages?: number;
  /** Minimum text length per page to consider as having extracted text (default: 50) */
  minTextLength?: number;
}

// ============================================================================
// Document Processor Interface
// ============================================================================

/**
 * Document processor interface (generic over result and error types)
 */
export interface DocumentProcessor<TResult, TOptions = unknown, TError = TextProcessorError> {
  /**
   * Process a document from storage
   * @param campaignId - The campaign the document belongs to
   * @param documentId - The document ID
   * @param options - Processing options
   */
  process(
    campaignId: string,
    documentId: string,
    options?: TOptions
  ): Promise<Result<TResult, TError>>;
}
