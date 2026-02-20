// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Document Chunking Service
 *
 * Splits documents into searchable chunks for embedding and retrieval.
 * Supports multiple chunking strategies:
 * - Fixed-size: Default strategy with configurable token size and overlap
 * - Semantic: Splits on document structure (headers/sections) for rulebooks
 * - Markdown-aware: Respects markdown formatting while chunking
 */

import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";
import type {
  ChunkingInput,
  ChunkingOptions,
  ChunkingResult,
  ChunkingError,
  DocumentChunk,
  TextChunkingInput,
  PdfChunkingInput,
  FixedSizeChunkingOptions,
  SemanticChunkingOptions,
  MarkdownChunkingOptions,
  ChunkingStrategy,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Characters per token (heuristic for English text) */
const CHARS_PER_TOKEN = 4;

/** Default fixed-size chunking options (sized for mxbai-embed-large 512-token context) */
const DEFAULT_FIXED_SIZE_OPTIONS: Required<FixedSizeChunkingOptions> = {
  targetTokens: 128,
  overlapTokens: 24,
  minChunkTokens: 20,
};

/** Default semantic chunking options (sized for mxbai-embed-large 512-token context) */
const DEFAULT_SEMANTIC_OPTIONS: Required<SemanticChunkingOptions> = {
  maxTokens: 128,
  minTokens: 30,
  maxHeadingLevel: 3,
};

/** Field name used to identify PDF chunking inputs */
const PDF_PAGES_FIELD = "pages";

/** Default markdown chunking options (sized for mxbai-embed-large 512-token context) */
const DEFAULT_MARKDOWN_OPTIONS: Required<MarkdownChunkingOptions> = {
  targetTokens: 128,
  overlapTokens: 24,
  preserveCodeBlocks: true,
  preserveLists: true,
};

// ============================================================================
// Token Counting
// ============================================================================

/**
 * Estimate token count from text
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This matches the estimation used in other processors.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Convert token count to approximate character count
 */
function tokensToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

/**
 * Build a DocumentChunk with optional properties only included when defined
 */
function buildChunk(
  content: string,
  chunkIndex: number,
  tokenCount: number,
  startOffset: number,
  endOffset: number,
  pageNumber: number | undefined,
  section: string | undefined
): DocumentChunk {
  const chunk: DocumentChunk = {
    content,
    chunkIndex,
    tokenCount,
    startOffset,
    endOffset,
  };
  if (pageNumber !== undefined) {
    chunk.pageNumber = pageNumber;
  }
  if (section !== undefined) {
    chunk.section = section;
  }
  return chunk;
}

// ============================================================================
// PDF Input Helpers
// ============================================================================

/**
 * Check if input is a PDF chunking input
 */
function isPdfInput(input: ChunkingInput): input is PdfChunkingInput {
  return PDF_PAGES_FIELD in input && Array.isArray(input.pages);
}

/**
 * Find page number for a given character offset in PDF content
 */
function findPageNumber(pages: PdfChunkingInput["pages"], offset: number): number | undefined {
  for (const page of pages) {
    if (offset >= page.startOffset && offset < page.endOffset) {
      return page.pageNumber;
    }
  }
  // If offset is at or past the end, return last page
  if (pages.length > 0 && offset >= pages[pages.length - 1]!.startOffset) {
    return pages[pages.length - 1]!.pageNumber;
  }
  return undefined;
}

// ============================================================================
// Text Splitting Utilities
// ============================================================================

/**
 * Find natural break points in text (sentence boundaries, paragraphs)
 */
function findNaturalBreak(text: string, targetPos: number, searchRadius: number): number {
  const minPos = Math.max(0, targetPos - searchRadius);

  // Priority 1: Paragraph break (double newline)
  for (let i = targetPos; i >= minPos; i--) {
    if (text.slice(i, i + 2) === "\n\n") {
      return i + 2;
    }
  }

  // Priority 2: Single newline
  for (let i = targetPos; i >= minPos; i--) {
    if (text[i] === "\n") {
      return i + 1;
    }
  }

  // Priority 3: Sentence boundary (. ! ?)
  for (let i = targetPos; i >= minPos; i--) {
    if (".!?".includes(text[i] || "") && (text[i + 1] === " " || text[i + 1] === "\n")) {
      return i + 1;
    }
  }

  // Priority 4: Space
  for (let i = targetPos; i >= minPos; i--) {
    if (text[i] === " ") {
      return i + 1;
    }
  }

  // No natural break found, use target position
  return targetPos;
}

// ============================================================================
// Fixed-Size Chunking Strategy
// ============================================================================

/**
 * Split content into fixed-size chunks with overlap
 *
 * Default strategy that works well for most documents.
 * Chunks are sized by token count with configurable overlap.
 */
function chunkFixedSize(
  input: ChunkingInput,
  options: FixedSizeChunkingOptions = {}
): DocumentChunk[] {
  const opts = { ...DEFAULT_FIXED_SIZE_OPTIONS, ...options };
  const { content } = input;

  if (!content.trim()) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  const targetChars = tokensToChars(opts.targetTokens);
  const overlapChars = tokensToChars(opts.overlapTokens);
  const minChunkChars = tokensToChars(opts.minChunkTokens);
  const searchRadius = Math.floor(targetChars * 0.1); // 10% flexibility for natural breaks

  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < content.length) {
    // Calculate end position
    let endPos = Math.min(currentPos + targetChars, content.length);

    // Find natural break point if not at end
    if (endPos < content.length) {
      endPos = findNaturalBreak(content, endPos, searchRadius);
    }

    // Extract chunk content
    const chunkContent = content.slice(currentPos, endPos).trim();

    if (chunkContent.length > 0) {
      // Determine page number for PDF inputs
      const pageNumber = isPdfInput(input)
        ? findPageNumber(input.pages, currentPos)
        : undefined;

      // Determine section from text input
      let section: string | undefined;
      if (!isPdfInput(input) && input.sections) {
        const sectionMatch = input.sections.find((s) => {
          const sectionStartOffset = content.indexOf(s.content);
          return sectionStartOffset !== -1 && currentPos >= sectionStartOffset;
        });
        if (sectionMatch?.heading) {
          section = sectionMatch.heading;
        }
      }

      chunks.push(buildChunk(
        chunkContent,
        chunkIndex,
        estimateTokenCount(chunkContent),
        currentPos,
        endPos,
        pageNumber,
        section
      ));

      chunkIndex++;
    }

    // Move position, accounting for overlap
    const nextPos = endPos - overlapChars;

    // Ensure we make progress
    if (nextPos <= currentPos) {
      currentPos = endPos;
    } else {
      currentPos = nextPos;
    }

    // Stop if remaining content is too small
    if (content.length - currentPos < minChunkChars && chunks.length > 0) {
      // Append remaining content to last chunk if small
      const remaining = content.slice(currentPos).trim();
      if (remaining.length > 0 && remaining.length < minChunkChars) {
        const lastChunk = chunks[chunks.length - 1]!;
        lastChunk.content = lastChunk.content + "\n\n" + remaining;
        lastChunk.tokenCount = estimateTokenCount(lastChunk.content);
        lastChunk.endOffset = content.length;
      }
      break;
    }
  }

  return chunks;
}

// ============================================================================
// Semantic Chunking Strategy
// ============================================================================

/**
 * Split content based on document structure (headers/sections)
 *
 * Best for rulebooks and structured documents where sections
 * form natural semantic boundaries.
 */
function chunkSemantic(
  input: ChunkingInput,
  options: SemanticChunkingOptions = {}
): DocumentChunk[] {
  const opts = { ...DEFAULT_SEMANTIC_OPTIONS, ...options };
  const { content } = input;

  if (!content.trim()) {
    return [];
  }

  // For PDF input without sections, fall back to fixed-size
  if (isPdfInput(input)) {
    return chunkFixedSize(input, {
      targetTokens: opts.maxTokens,
      overlapTokens: Math.floor(opts.maxTokens * 0.1),
      minChunkTokens: opts.minTokens,
    });
  }

  const textInput = input as TextChunkingInput;
  const sections = textInput.sections;

  // If no sections detected, fall back to fixed-size
  if (!sections || sections.length === 0) {
    return chunkFixedSize(input, {
      targetTokens: opts.maxTokens,
      overlapTokens: Math.floor(opts.maxTokens * 0.1),
      minChunkTokens: opts.minTokens,
    });
  }

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  // Filter sections by heading level
  const relevantSections = sections.filter(
    (s) => s.level === 0 || s.level <= opts.maxHeadingLevel
  );

  // Track accumulated content for merging small sections
  let accumulatedContent = "";
  let accumulatedSection: string | undefined;
  let accumulatedStartOffset = 0;

  for (let i = 0; i < relevantSections.length; i++) {
    const section = relevantSections[i]!;
    const sectionContent = section.heading
      ? `## ${section.heading}\n\n${section.content}`
      : section.content;

    const sectionTokens = estimateTokenCount(sectionContent);
    const sectionStartOffset = content.indexOf(section.content);

    // If section is too large, split it using fixed-size
    if (sectionTokens > opts.maxTokens) {
      // First, flush any accumulated content
      if (accumulatedContent.trim()) {
        chunks.push(buildChunk(
          accumulatedContent.trim(),
          chunkIndex,
          estimateTokenCount(accumulatedContent),
          accumulatedStartOffset,
          sectionStartOffset,
          undefined,
          accumulatedSection
        ));
        chunkIndex++;
        accumulatedContent = "";
        accumulatedSection = undefined;
      }

      // Split large section
      const subChunks = chunkFixedSize(
        { content: sectionContent },
        {
          targetTokens: opts.maxTokens,
          overlapTokens: Math.floor(opts.maxTokens * 0.1),
          minChunkTokens: opts.minTokens,
        }
      );

      for (const subChunk of subChunks) {
        chunks.push(buildChunk(
          subChunk.content,
          chunkIndex,
          subChunk.tokenCount,
          sectionStartOffset + subChunk.startOffset,
          sectionStartOffset + subChunk.endOffset,
          undefined,
          section.heading
        ));
        chunkIndex++;
      }
    } else if (sectionTokens < opts.minTokens) {
      // Section is too small, accumulate for merging
      if (!accumulatedContent) {
        accumulatedStartOffset = sectionStartOffset;
        accumulatedSection = section.heading;
      }
      accumulatedContent += (accumulatedContent ? "\n\n" : "") + sectionContent;

      // Check if accumulated content is now large enough
      const accumulatedTokens = estimateTokenCount(accumulatedContent);
      if (accumulatedTokens >= opts.minTokens) {
        chunks.push(buildChunk(
          accumulatedContent.trim(),
          chunkIndex,
          accumulatedTokens,
          accumulatedStartOffset,
          sectionStartOffset + section.content.length,
          undefined,
          accumulatedSection
        ));
        chunkIndex++;
        accumulatedContent = "";
        accumulatedSection = undefined;
      }
    } else {
      // Section is appropriately sized
      // First, flush any accumulated content
      if (accumulatedContent.trim()) {
        chunks.push(buildChunk(
          accumulatedContent.trim(),
          chunkIndex,
          estimateTokenCount(accumulatedContent),
          accumulatedStartOffset,
          sectionStartOffset,
          undefined,
          accumulatedSection
        ));
        chunkIndex++;
        accumulatedContent = "";
        accumulatedSection = undefined;
      }

      chunks.push(buildChunk(
        sectionContent.trim(),
        chunkIndex,
        sectionTokens,
        sectionStartOffset,
        sectionStartOffset + section.content.length,
        undefined,
        section.heading
      ));
      chunkIndex++;
    }
  }

  // Flush any remaining accumulated content
  if (accumulatedContent.trim()) {
    chunks.push(buildChunk(
      accumulatedContent.trim(),
      chunkIndex,
      estimateTokenCount(accumulatedContent),
      accumulatedStartOffset,
      content.length,
      undefined,
      accumulatedSection
    ));
  }

  return chunks;
}

// ============================================================================
// Markdown-Aware Chunking Strategy
// ============================================================================

/**
 * Find code blocks and their positions
 */
function findCodeBlocks(content: string): Array<{ start: number; end: number; content: string }> {
  const blocks: Array<{ start: number; end: number; content: string }> = [];
  const regex = /```[\s\S]*?```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
    });
  }

  return blocks;
}

/**
 * Find list blocks (consecutive list items)
 */
function findListBlocks(content: string): Array<{ start: number; end: number; content: string }> {
  const blocks: Array<{ start: number; end: number; content: string }> = [];
  const lines = content.split("\n");
  let inList = false;
  let listStart = 0;
  let listContent = "";
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isListItem = /^[\s]*[-*+]\s+.+$/.test(line) || /^[\s]*\d+\.\s+.+$/.test(line);

    if (isListItem) {
      if (!inList) {
        inList = true;
        listStart = currentOffset;
        listContent = line;
      } else {
        listContent += "\n" + line;
      }
    } else if (inList) {
      // Check if this is a continuation (indented line after list item)
      if (line.startsWith("  ") || line.startsWith("\t")) {
        listContent += "\n" + line;
      } else {
        // End of list
        blocks.push({
          start: listStart,
          end: currentOffset,
          content: listContent,
        });
        inList = false;
        listContent = "";
      }
    }

    currentOffset += line.length + 1; // +1 for newline
  }

  // Don't forget last list
  if (inList && listContent) {
    blocks.push({
      start: listStart,
      end: content.length,
      content: listContent,
    });
  }

  return blocks;
}

/**
 * Split content respecting markdown formatting
 *
 * Preserves code blocks and lists when possible.
 */
function chunkMarkdownAware(
  input: ChunkingInput,
  options: MarkdownChunkingOptions = {}
): DocumentChunk[] {
  const opts = { ...DEFAULT_MARKDOWN_OPTIONS, ...options };
  const { content } = input;

  if (!content.trim()) {
    return [];
  }

  // Find protected blocks (code blocks, lists)
  const protectedBlocks: Array<{ start: number; end: number; content: string }> = [];

  if (opts.preserveCodeBlocks) {
    protectedBlocks.push(...findCodeBlocks(content));
  }

  if (opts.preserveLists) {
    const listBlocks = findListBlocks(content);
    // Only add lists that don't overlap with code blocks
    for (const list of listBlocks) {
      const overlaps = protectedBlocks.some(
        (block) =>
          (list.start >= block.start && list.start < block.end) ||
          (list.end > block.start && list.end <= block.end)
      );
      if (!overlaps) {
        protectedBlocks.push(list);
      }
    }
  }

  // Sort protected blocks by start position
  protectedBlocks.sort((a, b) => a.start - b.start);

  const chunks: DocumentChunk[] = [];
  const targetChars = tokensToChars(opts.targetTokens);
  const overlapChars = tokensToChars(opts.overlapTokens);
  const searchRadius = Math.floor(targetChars * 0.1);

  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < content.length) {
    let endPos = Math.min(currentPos + targetChars, content.length);

    // Check if end position is in a protected block
    if (endPos < content.length) {
      const inProtectedBlock = protectedBlocks.find(
        (block) => endPos > block.start && endPos < block.end
      );

      if (inProtectedBlock) {
        // Extend to end of protected block if it would fit
        const extendedTokens = estimateTokenCount(
          content.slice(currentPos, inProtectedBlock.end)
        );

        if (extendedTokens <= opts.targetTokens * 1.5) {
          // Allow 50% overage to keep block intact
          endPos = inProtectedBlock.end;
        } else {
          // Block is too large, split before it
          endPos = inProtectedBlock.start;
        }
      } else {
        // Find natural break point
        endPos = findNaturalBreak(content, endPos, searchRadius);

        // Make sure we don't break into a protected block
        const wouldBreakInto = protectedBlocks.find(
          (block) => endPos > block.start && endPos < block.end
        );
        if (wouldBreakInto) {
          endPos = wouldBreakInto.start;
        }
      }
    }

    // Ensure we make progress
    if (endPos <= currentPos) {
      endPos = Math.min(currentPos + targetChars, content.length);
    }

    const chunkContent = content.slice(currentPos, endPos).trim();

    if (chunkContent.length > 0) {
      // Determine section from markdown headings
      let section: string | undefined;
      const headingMatch = /^#{1,6}\s+(.+)$/m.exec(chunkContent);
      if (headingMatch) {
        section = headingMatch[1];
      } else if (!isPdfInput(input) && input.sections) {
        // Fall back to input sections
        const sectionMatch = input.sections.find((s) => {
          const sectionStart = content.indexOf(s.content);
          return sectionStart !== -1 && currentPos >= sectionStart;
        });
        if (sectionMatch?.heading) {
          section = sectionMatch.heading;
        }
      }

      // Determine page number for PDF inputs
      const pageNumber = isPdfInput(input)
        ? findPageNumber(input.pages, currentPos)
        : undefined;

      chunks.push(buildChunk(
        chunkContent,
        chunkIndex,
        estimateTokenCount(chunkContent),
        currentPos,
        endPos,
        pageNumber,
        section
      ));

      chunkIndex++;
    }

    // Move position, accounting for overlap
    // Don't overlap into protected blocks
    let nextPos = endPos - overlapChars;

    const overlapInProtected = protectedBlocks.find(
      (block) => nextPos > block.start && nextPos < block.end
    );
    if (overlapInProtected) {
      nextPos = overlapInProtected.end;
    }

    // Ensure we make progress
    if (nextPos <= currentPos) {
      currentPos = endPos;
    } else {
      currentPos = nextPos;
    }
  }

  return chunks;
}

// ============================================================================
// Chunking Service
// ============================================================================

/**
 * Chunking service interface
 */
export interface ChunkingService {
  /**
   * Chunk document content using the specified strategy
   */
  chunk(
    input: ChunkingInput,
    options?: ChunkingOptions
  ): Result<ChunkingResult, ChunkingError>;

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;
}

/**
 * Create a chunking service
 */
export function createChunkingService(): ChunkingService {
  return {
    chunk(
      input: ChunkingInput,
      options: ChunkingOptions = {}
    ): Result<ChunkingResult, ChunkingError> {
      // Validate input
      if (!input.content?.trim()) {
        return err({
          code: "EMPTY_CONTENT",
          message: "Document content is empty",
        });
      }

      // Determine strategy
      const strategy: ChunkingStrategy = options.strategy ?? "fixed-size";

      // Execute chunking based on strategy
      let chunks: DocumentChunk[];

      try {
        switch (strategy) {
          case "fixed-size":
            chunks = chunkFixedSize(input, options.fixedSize);
            break;

          case "semantic":
            chunks = chunkSemantic(input, options.semantic);
            break;

          case "markdown-aware":
            chunks = chunkMarkdownAware(input, options.markdown);
            break;

          default:
            return err({
              code: "INVALID_OPTIONS",
              message: `Unknown chunking strategy: ${strategy}`,
            });
        }
      } catch (error) {
        return err({
          code: "PROCESSING_ERROR",
          message: "Failed to chunk document",
          cause: error,
        });
      }

      // Calculate statistics
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
      const averageChunkTokens = chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0;

      return ok({
        chunks,
        strategy,
        totalTokens,
        averageChunkTokens,
      });
    },

    estimateTokens(text: string): number {
      return estimateTokenCount(text);
    },
  };
}

// Export strategy functions for testing
export { chunkFixedSize, chunkSemantic, chunkMarkdownAware };
