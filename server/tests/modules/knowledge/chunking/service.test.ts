// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { createChunkingService } from "@/modules/knowledge/chunking/service.js";
import type { PdfChunkingInput } from "@/modules/knowledge/chunking/types.js";

describe("Chunking service — page-range tracking", () => {
  it("tags a chunk with start and end pages when it spans a page break", () => {
    // Two adjacent pages, no delimiter, large enough that fixed-size chunking
    // (256-token target ≈ 1024 chars) will produce a chunk that crosses the
    // boundary at offset 800.
    const page1 = "A".repeat(800);
    const page2 = "B".repeat(800);
    const content = page1 + page2;

    const input: PdfChunkingInput = {
      content,
      pages: [
        { pageNumber: 1, content: page1, startOffset: 0, endOffset: 800 },
        { pageNumber: 2, content: page2, startOffset: 800, endOffset: 1600 },
      ],
      pageCount: 2,
    };

    const service = createChunkingService();
    const result = service.chunk(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The first chunk starts on page 1; it should also end on page 2 because
    // the target chunk size pushes its endOffset past 800.
    const first = result.value.chunks[0]!;
    expect(first.pageNumber).toBe(1);
    expect(first.endPageNumber).toBe(2);
  });

  it("leaves endPageNumber equal to pageNumber for chunks that fit on one page", () => {
    const onlyPage = "Lorem ipsum dolor sit amet. ".repeat(20);
    const input: PdfChunkingInput = {
      content: onlyPage,
      pages: [
        {
          pageNumber: 3,
          content: onlyPage,
          startOffset: 0,
          endOffset: onlyPage.length,
        },
      ],
      pageCount: 1,
    };

    const service = createChunkingService();
    const result = service.chunk(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const first = result.value.chunks[0]!;
    expect(first.pageNumber).toBe(3);
    expect(first.endPageNumber).toBe(3);
  });

  it("does not set page numbers for plain-text inputs", () => {
    const service = createChunkingService();
    const result = service.chunk({ content: "Plain text body without pages." });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const first = result.value.chunks[0]!;
    expect(first.pageNumber).toBeUndefined();
    expect(first.endPageNumber).toBeUndefined();
  });
});
