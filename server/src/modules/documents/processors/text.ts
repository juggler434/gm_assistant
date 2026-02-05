/**
 * Text/Markdown Document Processor
 *
 * Processes plain text (.txt) and markdown (.md) files:
 * - Reads content from storage
 * - Handles UTF-8 encoding
 * - Detects section headers (for markdown)
 * - Calculates character and token counts
 */

import { createStorageService } from "@/services/storage/index.js";
import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";
import type {
  DocumentProcessor,
  DocumentSection,
  TextProcessorError,
  TextProcessorOptions,
  TextProcessorResult,
} from "./types.js";

/**
 * Estimate token count from text
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is a rough approximation; actual token counts vary by tokenizer.
 */
function estimateTokenCount(text: string): number {
  // Common approximation: 1 token ≈ 4 characters for English
  // This works reasonably well for most LLM tokenizers
  const CHARS_PER_TOKEN = 4;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Markdown heading pattern: # Heading, ## Heading, etc.
 * Captures: level (number of #), heading text
 */
const MARKDOWN_HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

/**
 * Detect sections in markdown content
 *
 * Parses markdown headings (#, ##, etc.) and groups content into sections.
 * Content before the first heading is placed in a section with level 0.
 */
function detectMarkdownSections(content: string): DocumentSection[] {
  const lines = content.split("\n");
  const sections: DocumentSection[] = [];

  let currentSection: DocumentSection | null = null;
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1; // 1-indexed
    const match = MARKDOWN_HEADING_REGEX.exec(line);

    if (match) {
      // Found a heading - save current section if exists
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        currentSection.endLine = lineNumber - 1;
        sections.push(currentSection);
      } else if (contentLines.length > 0) {
        // Content before first heading
        const preContent = contentLines.join("\n").trim();
        if (preContent) {
          sections.push({
            heading: "",
            level: 0,
            content: preContent,
            startLine: 1,
            endLine: lineNumber - 1,
          });
        }
      }

      // Start new section
      currentSection = {
        heading: match[2]!.trim(),
        level: match[1]!.length,
        content: "",
        startLine: lineNumber,
        endLine: lineNumber,
      };
      contentLines = [];
    } else {
      contentLines.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    currentSection.endLine = lines.length;
    sections.push(currentSection);
  } else if (contentLines.length > 0) {
    // File with no headings at all
    const content = contentLines.join("\n").trim();
    if (content) {
      sections.push({
        heading: "",
        level: 0,
        content,
        startLine: 1,
        endLine: lines.length,
      });
    }
  }

  return sections;
}

/**
 * Detect sections in plain text content
 *
 * For plain text files, returns a single section containing all content.
 */
function detectPlainTextSections(content: string): DocumentSection[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const lineCount = content.split("\n").length;

  return [
    {
      heading: "",
      level: 0,
      content: trimmed,
      startLine: 1,
      endLine: lineCount,
    },
  ];
}

/**
 * Decode buffer to UTF-8 string
 *
 * Handles common encodings and normalizes to UTF-8.
 * Removes BOM if present.
 */
function decodeToUtf8(buffer: Buffer): string {
  let content = buffer.toString("utf-8");

  // Remove UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  // Normalize line endings to \n
  content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return content;
}

export interface TextProcessorDeps {
  storage: ReturnType<typeof createStorageService>;
}

/**
 * Create a text/markdown processor
 */
export function createTextProcessor(
  deps?: TextProcessorDeps
): DocumentProcessor<TextProcessorResult, TextProcessorOptions> {
  const storage = deps?.storage ?? createStorageService();

  return {
    async process(
      campaignId: string,
      documentId: string,
      options?: TextProcessorOptions
    ): Promise<Result<TextProcessorResult, TextProcessorError>> {
      // Download file from storage
      const downloadResult = await storage.download(campaignId, documentId);

      if (!downloadResult.ok) {
        return err({
          code: "STORAGE_ERROR",
          message: `Failed to download document: ${downloadResult.error.message}`,
          cause: downloadResult.error,
        });
      }

      const { content: buffer, contentType } = downloadResult.value;

      // Decode content to UTF-8
      let content: string;
      try {
        content = decodeToUtf8(buffer);
      } catch (error) {
        return err({
          code: "ENCODING_ERROR",
          message: "Failed to decode file content as UTF-8",
          cause: error,
        });
      }

      // Check for empty file
      if (!content.trim()) {
        return err({
          code: "EMPTY_FILE",
          message: "Document is empty",
        });
      }

      // Determine if we should detect sections
      const isMarkdown =
        contentType === "text/markdown" || contentType?.endsWith(".md");
      const shouldDetectSections = options?.detectSections ?? isMarkdown;

      // Detect sections
      const sections = shouldDetectSections
        ? detectMarkdownSections(content)
        : detectPlainTextSections(content);

      // Calculate counts
      const characterCount = content.length;
      const tokenCount = estimateTokenCount(content);

      return ok({
        content,
        sections,
        characterCount,
        tokenCount,
        encoding: "utf-8",
      });
    },
  };
}

// Export section detection functions for testing
export { detectMarkdownSections, detectPlainTextSections, estimateTokenCount };
