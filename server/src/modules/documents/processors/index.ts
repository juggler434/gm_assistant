// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Document Processors
 *
 * Processors for extracting text and metadata from various document formats.
 */

// Text/Markdown processor
export {
  createTextProcessor,
  detectMarkdownSections,
  detectPlainTextSections,
  estimateTokenCount,
} from "./text.js";

// PDF processor
export {
  createPdfProcessor,
  extractPdfMetadata,
  parsePdfDate,
  extractMetadata,
} from "./pdf.js";

// Types
export type {
  DocumentProcessor,
  DocumentSection,
  TextProcessorError,
  TextProcessorErrorCode,
  TextProcessorOptions,
  TextProcessorResult,
  // PDF types
  PdfPage,
  PdfMetadata,
  PdfProcessorError,
  PdfProcessorErrorCode,
  PdfProcessorOptions,
  PdfProcessorResult,
} from "./types.js";
