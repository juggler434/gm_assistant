// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * PDF Document Processor
 *
 * Processes PDF files:
 * - Downloads content from storage
 * - Extracts text content with page boundaries
 * - Extracts document metadata
 * - Calculates character and token counts
 * - Detects scanned PDFs (no extractable text)
 */

import pdf from "pdf-parse";
import { createStorageService } from "@/services/storage/index.js";
import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";
import type {
  DocumentProcessor,
  PdfPage,
  PdfMetadata,
  PdfProcessorError,
  PdfProcessorOptions,
  PdfProcessorResult,
} from "./types.js";

/** Default delimiter between pages */
const DEFAULT_PAGE_DELIMITER = "\n\n--- Page {n} ---\n\n";

/** Default minimum text length to consider as having extracted text */
const DEFAULT_MIN_TEXT_LENGTH = 50;

/**
 * Estimate token count from text
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 */
function estimateTokenCount(text: string): number {
  const CHARS_PER_TOKEN = 4;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Parse a PDF date string into a Date object
 *
 * PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
 * Example: D:20230101120000+00'00'
 */
function parsePdfDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;

  // Remove the "D:" prefix if present
  const cleaned = dateStr.startsWith("D:") ? dateStr.slice(2) : dateStr;

  // Extract date components
  const match = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(
    cleaned
  );
  if (!match) return undefined;

  const year = parseInt(match[1]!, 10);
  const month = match[2] ? parseInt(match[2], 10) - 1 : 0;
  const day = match[3] ? parseInt(match[3], 10) : 1;
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  const second = match[6] ? parseInt(match[6], 10) : 0;

  try {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  } catch {
    return undefined;
  }
}

/**
 * PDF info dictionary type
 */
interface PdfInfo {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: string;
  ModDate?: string;
}

/**
 * PDF text content item
 */
interface PdfTextItem {
  str: string;
}

/**
 * Extract metadata from PDF info dictionary
 */
function extractMetadata(
  info: PdfInfo | undefined,
  pageCount: number,
  pdfVersion?: string
): PdfMetadata {
  const metadata: PdfMetadata = {
    pageCount,
  };

  if (info?.Title) metadata.title = info.Title;
  if (info?.Author) metadata.author = info.Author;
  if (info?.Subject) metadata.subject = info.Subject;
  if (info?.Keywords) metadata.keywords = info.Keywords;
  if (info?.Creator) metadata.creator = info.Creator;
  if (info?.Producer) metadata.producer = info.Producer;

  const creationDate = parsePdfDate(info?.CreationDate);
  if (creationDate) metadata.creationDate = creationDate;

  const modificationDate = parsePdfDate(info?.ModDate);
  if (modificationDate) metadata.modificationDate = modificationDate;

  if (pdfVersion) metadata.pdfVersion = pdfVersion;

  return metadata;
}

/**
 * Format page delimiter with page number
 */
function formatPageDelimiter(template: string, pageNumber: number): string {
  return template.replace("{n}", String(pageNumber));
}

/**
 * Check if the parsed PDF error indicates an encrypted PDF
 */
function isEncryptedPdfError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("encrypted") ||
      message.includes("password") ||
      message.includes("protected")
    );
  }
  return false;
}

/**
 * Check if the parsed PDF error indicates an invalid PDF
 */
function isInvalidPdfError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("invalid pdf") ||
      message.includes("not a pdf") ||
      message.includes("pdf header not found") ||
      message.includes("bad pdf")
    );
  }
  return false;
}

/**
 * Parse a PDF buffer and extract text content, pages, and metadata.
 *
 * This is the core parsing logic used by both the document processor
 * (after downloading from storage) and the OCR fallback path (after
 * running OCR on a scanned PDF).
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  options?: PdfProcessorOptions,
): Promise<Result<PdfProcessorResult, PdfProcessorError>> {
  const pageDelimiter = options?.pageDelimiter ?? DEFAULT_PAGE_DELIMITER;
  const minTextLength = options?.minTextLength ?? DEFAULT_MIN_TEXT_LENGTH;

  // Collect page texts during parsing
  const pageTexts: string[] = [];

  try {
    // Parse PDF with custom page renderer to capture per-page text
    const pdfData = await pdf(buffer, {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{ items: PdfTextItem[] }>;
      }) => {
        const textContent = await pageData.getTextContent();
        const text = textContent.items
          .map((item: PdfTextItem) => item.str)
          .join(" ");
        pageTexts.push(text);
        return text;
      },
      max: options?.maxPages ?? 0, // 0 = all pages
    });

    // Check for empty PDF (no pages)
    if (pdfData.numpages === 0) {
      return err({
        code: "EMPTY_PDF",
        message: "PDF document has no pages",
      });
    }

    // Build pages array with character offsets
    const pages: PdfPage[] = [];
    let currentOffset = 0;

    for (let i = 0; i < pageTexts.length; i++) {
      const pageNumber = i + 1;
      const pageContent = pageTexts[i]!.trim();

      // Add page delimiter if not the first page
      if (i > 0) {
        const delimiter = formatPageDelimiter(pageDelimiter, pageNumber);
        currentOffset += delimiter.length;
      }

      const startOffset = currentOffset;
      const endOffset = startOffset + pageContent.length;
      currentOffset = endOffset;

      pages.push({
        pageNumber,
        content: pageContent,
        startOffset,
        endOffset,
      });
    }

    // Build full content with page delimiters
    const contentParts: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) {
        const delimiter = formatPageDelimiter(pageDelimiter, i + 1);
        contentParts.push(delimiter);
      }
      contentParts.push(pages[i]!.content);
    }
    const content = contentParts.join("");

    // Determine if text was successfully extracted
    const totalTextLength = pages.reduce(
      (sum, page) => sum + page.content.length,
      0
    );
    const averageTextPerPage =
      pages.length > 0 ? totalTextLength / pages.length : 0;
    const hasExtractedText = averageTextPerPage >= minTextLength;

    // Extract metadata
    const metadata = extractMetadata(
      pdfData.info as PdfInfo | undefined,
      pdfData.numpages,
      pdfData.metadata?._metadata?.["dc:format"] as string | undefined
    );

    return ok({
      content,
      pages,
      pageCount: pdfData.numpages,
      metadata,
      characterCount: content.length,
      tokenCount: estimateTokenCount(content),
      hasExtractedText,
    });
  } catch (error) {
    // Handle specific PDF errors
    if (isEncryptedPdfError(error)) {
      return err({
        code: "ENCRYPTED_PDF",
        message: "PDF is password-protected and cannot be processed",
        cause: error,
      });
    }

    if (isInvalidPdfError(error)) {
      return err({
        code: "INVALID_PDF",
        message: "File is not a valid PDF document",
        cause: error,
      });
    }

    // Generic parse error
    return err({
      code: "PARSE_ERROR",
      message:
        error instanceof Error
          ? `Failed to parse PDF: ${error.message}`
          : "Failed to parse PDF",
      cause: error,
    });
  }
}

export interface PdfProcessorDeps {
  storage: ReturnType<typeof createStorageService>;
}

/**
 * Create a PDF processor
 */
export function createPdfProcessor(
  deps?: PdfProcessorDeps
): DocumentProcessor<PdfProcessorResult, PdfProcessorOptions, PdfProcessorError> {
  const storage = deps?.storage ?? createStorageService();

  return {
    async process(
      campaignId: string,
      documentId: string,
      options?: PdfProcessorOptions
    ): Promise<Result<PdfProcessorResult, PdfProcessorError>> {
      // Download file from storage
      const downloadResult = await storage.download(campaignId, documentId);

      if (!downloadResult.ok) {
        return err({
          code: "STORAGE_ERROR",
          message: `Failed to download document: ${downloadResult.error.message}`,
          cause: downloadResult.error,
        });
      }

      return parsePdfBuffer(downloadResult.value.content, options);
    },
  };
}

/**
 * Extract metadata from a PDF buffer without full text extraction
 */
export async function extractPdfMetadata(
  buffer: Buffer
): Promise<Result<PdfMetadata, PdfProcessorError>> {
  try {
    const pdfData = await pdf(buffer, {
      max: 1, // Only parse first page for metadata
    });

    return ok(
      extractMetadata(
        pdfData.info as PdfInfo | undefined,
        pdfData.numpages,
        pdfData.metadata?._metadata?.["dc:format"] as string | undefined
      )
    );
  } catch (error) {
    if (isEncryptedPdfError(error)) {
      return err({
        code: "ENCRYPTED_PDF",
        message: "PDF is password-protected",
        cause: error,
      });
    }

    if (isInvalidPdfError(error)) {
      return err({
        code: "INVALID_PDF",
        message: "File is not a valid PDF document",
        cause: error,
      });
    }

    return err({
      code: "PARSE_ERROR",
      message:
        error instanceof Error
          ? `Failed to extract metadata: ${error.message}`
          : "Failed to extract metadata",
      cause: error,
    });
  }
}

// Export helper functions for testing
export { parsePdfDate, extractMetadata, estimateTokenCount };
