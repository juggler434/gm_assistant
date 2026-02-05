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

// Types
export type {
  DocumentProcessor,
  DocumentSection,
  TextProcessorError,
  TextProcessorErrorCode,
  TextProcessorOptions,
  TextProcessorResult,
} from "./types.js";
