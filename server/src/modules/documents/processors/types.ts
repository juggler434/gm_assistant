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

/**
 * Document processor interface
 */
export interface DocumentProcessor<TResult, TOptions = unknown> {
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
  ): Promise<Result<TResult, TextProcessorError>>;
}
