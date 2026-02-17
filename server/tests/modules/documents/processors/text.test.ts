// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  createTextProcessor,
  detectMarkdownSections,
  detectPlainTextSections,
  estimateTokenCount,
  type TextProcessorDeps,
} from "../../../../src/modules/documents/processors/text.js";
import { ok, err } from "../../../../src/types/index.js";
import { StorageError } from "../../../../src/services/storage/errors.js";

// Mock storage service with properly typed download method
interface MockStorage {
  download: Mock;
}

const mockStorage: MockStorage = {
  download: vi.fn(),
};

function createMockDeps(): TextProcessorDeps {
  return { storage: mockStorage as unknown as TextProcessorDeps["storage"] };
}

describe("Text Processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("estimateTokenCount", () => {
    it("estimates tokens based on character count", () => {
      // ~4 chars per token
      expect(estimateTokenCount("hello")).toBe(2); // 5 chars / 4 = 1.25 → 2
      expect(estimateTokenCount("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
      expect(estimateTokenCount("")).toBe(0);
    });

    it("handles longer text", () => {
      const longText = "a".repeat(1000);
      expect(estimateTokenCount(longText)).toBe(250); // 1000 / 4 = 250
    });
  });

  describe("detectMarkdownSections", () => {
    it("detects single heading", () => {
      const content = "# Hello\n\nThis is content.";
      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(1);
      expect(sections[0]).toEqual({
        heading: "Hello",
        level: 1,
        content: "This is content.",
        startLine: 1,
        endLine: 3,
      });
    });

    it("detects multiple headings at different levels", () => {
      const content = `# Title

Introduction text.

## Section 1

Content for section 1.

### Subsection 1.1

Subsection content.

## Section 2

Content for section 2.`;

      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(4);
      expect(sections[0].heading).toBe("Title");
      expect(sections[0].level).toBe(1);
      expect(sections[1].heading).toBe("Section 1");
      expect(sections[1].level).toBe(2);
      expect(sections[2].heading).toBe("Subsection 1.1");
      expect(sections[2].level).toBe(3);
      expect(sections[3].heading).toBe("Section 2");
      expect(sections[3].level).toBe(2);
    });

    it("captures content before first heading", () => {
      const content = `Some intro text here.

# First Heading

Heading content.`;

      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(2);
      expect(sections[0]).toEqual({
        heading: "",
        level: 0,
        content: "Some intro text here.",
        startLine: 1,
        endLine: 2,
      });
      expect(sections[1].heading).toBe("First Heading");
    });

    it("handles file with no headings", () => {
      const content = "Just plain text\nwith multiple lines\nand no headings.";
      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(1);
      expect(sections[0]).toEqual({
        heading: "",
        level: 0,
        content: "Just plain text\nwith multiple lines\nand no headings.",
        startLine: 1,
        endLine: 3,
      });
    });

    it("handles all heading levels (h1-h6)", () => {
      const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(6);
      expect(sections.map((s) => s.level)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("ignores invalid headings (more than 6 #)", () => {
      const content = `# Valid
####### Invalid - too many hashes`;

      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(1);
      expect(sections[0].heading).toBe("Valid");
      expect(sections[0].content).toBe("####### Invalid - too many hashes");
    });

    it("requires space after #", () => {
      const content = `#NoSpace
# With Space`;

      const sections = detectMarkdownSections(content);

      expect(sections).toHaveLength(2);
      expect(sections[0]).toEqual({
        heading: "",
        level: 0,
        content: "#NoSpace",
        startLine: 1,
        endLine: 1,
      });
      expect(sections[1].heading).toBe("With Space");
    });

    it("handles empty content", () => {
      const sections = detectMarkdownSections("");
      expect(sections).toHaveLength(0);
    });

    it("handles whitespace-only content", () => {
      const sections = detectMarkdownSections("   \n  \n   ");
      expect(sections).toHaveLength(0);
    });
  });

  describe("detectPlainTextSections", () => {
    it("returns single section for plain text", () => {
      const content = "This is plain text\nwith multiple lines.";
      const sections = detectPlainTextSections(content);

      expect(sections).toHaveLength(1);
      expect(sections[0]).toEqual({
        heading: "",
        level: 0,
        content: "This is plain text\nwith multiple lines.",
        startLine: 1,
        endLine: 2,
      });
    });

    it("returns empty array for empty content", () => {
      expect(detectPlainTextSections("")).toHaveLength(0);
      expect(detectPlainTextSections("   ")).toHaveLength(0);
    });
  });

  describe("createTextProcessor", () => {
    it("processes plain text file", async () => {
      const content = "Hello, world!\nThis is a test.";
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from(content, "utf-8"),
          contentType: "text/plain",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe(content);
        expect(result.value.sections).toHaveLength(1);
        expect(result.value.characterCount).toBe(content.length);
        expect(result.value.tokenCount).toBe(Math.ceil(content.length / 4));
        expect(result.value.encoding).toBe("utf-8");
      }
    });

    it("processes markdown file with section detection", async () => {
      const content = `# Title

Introduction.

## Section 1

Content.`;

      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from(content, "utf-8"),
          contentType: "text/markdown",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sections).toHaveLength(2);
        expect(result.value.sections[0].heading).toBe("Title");
        expect(result.value.sections[1].heading).toBe("Section 1");
      }
    });

    it("handles UTF-8 BOM", async () => {
      const content = "Hello";
      const bomBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM
        Buffer.from(content, "utf-8"),
      ]);

      mockStorage.download.mockResolvedValue(
        ok({
          content: bomBuffer,
          contentType: "text/plain",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // BOM should be stripped
        expect(result.value.content).toBe(content);
      }
    });

    it("normalizes CRLF line endings", async () => {
      const content = "Line 1\r\nLine 2\rLine 3";
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from(content, "utf-8"),
          contentType: "text/plain",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe("Line 1\nLine 2\nLine 3");
      }
    });

    it("returns error for empty file", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("   \n  ", "utf-8"),
          contentType: "text/plain",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMPTY_FILE");
      }
    });

    it("returns error when storage fails", async () => {
      mockStorage.download.mockResolvedValue(
        err(new StorageError("NOT_FOUND", "File not found"))
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORAGE_ERROR");
      }
    });

    it("respects detectSections option", async () => {
      const content = `# Heading

Content under heading.`;

      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from(content, "utf-8"),
          contentType: "text/markdown",
        })
      );

      const processor = createTextProcessor(createMockDeps());

      // With section detection disabled, should return single section
      const result = await processor.process("campaign-1", "doc-1", {
        detectSections: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sections).toHaveLength(1);
        expect(result.value.sections[0].level).toBe(0);
      }
    });

    it("enables section detection for .md content type", async () => {
      const content = `# Title

Content.`;

      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from(content, "utf-8"),
          contentType: "text/markdown",
        })
      );

      const processor = createTextProcessor(createMockDeps());
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sections[0].heading).toBe("Title");
      }
    });
  });
});
