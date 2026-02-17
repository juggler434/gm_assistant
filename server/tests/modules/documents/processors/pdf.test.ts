// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  createPdfProcessor,
  extractPdfMetadata,
  parsePdfDate,
  extractMetadata,
  type PdfProcessorOptions,
} from "../../../../src/modules/documents/processors/pdf.js";
import { ok, err } from "../../../../src/types/index.js";
import { StorageError } from "../../../../src/services/storage/errors.js";

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdf from "pdf-parse";

// Mock storage service
interface MockStorage {
  download: Mock;
}

const mockStorage: MockStorage = {
  download: vi.fn(),
};

interface PdfProcessorDeps {
  storage: unknown;
}

function createMockDeps(): PdfProcessorDeps {
  return { storage: mockStorage };
}

describe("PDF Processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parsePdfDate", () => {
    it("parses PDF date with D: prefix", () => {
      const date = parsePdfDate("D:20230615120000");
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2023);
      expect(date?.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(date?.getUTCDate()).toBe(15);
      expect(date?.getUTCHours()).toBe(12);
    });

    it("parses PDF date without D: prefix", () => {
      const date = parsePdfDate("20230615120000");
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2023);
    });

    it("parses date with only year and month", () => {
      const date = parsePdfDate("D:202306");
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2023);
      expect(date?.getUTCMonth()).toBe(5);
      expect(date?.getUTCDate()).toBe(1);
    });

    it("returns undefined for undefined input", () => {
      expect(parsePdfDate(undefined)).toBeUndefined();
    });

    it("returns undefined for invalid date string", () => {
      expect(parsePdfDate("invalid")).toBeUndefined();
    });
  });

  describe("extractMetadata", () => {
    it("extracts all metadata fields", () => {
      const info = {
        Title: "Test Document",
        Author: "Test Author",
        Subject: "Test Subject",
        Keywords: "test, keywords",
        Creator: "Test Creator",
        Producer: "Test Producer",
        CreationDate: "D:20230615120000",
        ModDate: "D:20230620150000",
      };

      const metadata = extractMetadata(info, 10, "1.7");

      expect(metadata.title).toBe("Test Document");
      expect(metadata.author).toBe("Test Author");
      expect(metadata.subject).toBe("Test Subject");
      expect(metadata.keywords).toBe("test, keywords");
      expect(metadata.creator).toBe("Test Creator");
      expect(metadata.producer).toBe("Test Producer");
      expect(metadata.creationDate).toBeInstanceOf(Date);
      expect(metadata.modificationDate).toBeInstanceOf(Date);
      expect(metadata.pageCount).toBe(10);
      expect(metadata.pdfVersion).toBe("1.7");
    });

    it("handles missing metadata fields", () => {
      const metadata = extractMetadata(undefined, 5);

      expect(metadata.title).toBeUndefined();
      expect(metadata.author).toBeUndefined();
      expect(metadata.pageCount).toBe(5);
    });
  });

  describe("createPdfProcessor", () => {
    it("processes PDF with page boundaries", async () => {
      const pdfBuffer = Buffer.from("fake pdf content");
      mockStorage.download.mockResolvedValue(
        ok({
          content: pdfBuffer,
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockImplementation(async (_buffer, options) => {
        // Simulate page render callback
        const pageTexts = ["Page 1 content", "Page 2 content", "Page 3 content"];
        for (let i = 0; i < pageTexts.length; i++) {
          if (options?.pagerender) {
            await options.pagerender({
              getTextContent: async () => ({
                items: [{ str: pageTexts[i] }],
              }),
            });
          }
        }

        return {
          numpages: 3,
          info: {
            Title: "Test PDF",
            Author: "Test Author",
          },
          text: pageTexts.join("\n"),
        };
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pageCount).toBe(3);
        expect(result.value.pages).toHaveLength(3);
        expect(result.value.pages[0]!.pageNumber).toBe(1);
        expect(result.value.pages[0]!.content).toBe("Page 1 content");
        expect(result.value.pages[0]!.startOffset).toBe(0);
        expect(result.value.pages[1]!.pageNumber).toBe(2);
        expect(result.value.pages[2]!.pageNumber).toBe(3);
        expect(result.value.metadata.title).toBe("Test PDF");
        expect(result.value.metadata.author).toBe("Test Author");
        expect(result.value.hasExtractedText).toBe(false); // Content is short
      }
    });

    it("extracts metadata correctly", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("fake pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockResolvedValue({
        numpages: 1,
        info: {
          Title: "Document Title",
          Author: "John Doe",
          Subject: "Test Subject",
          Keywords: "test, pdf, keywords",
          Creator: "Test App",
          Producer: "PDF Library",
          CreationDate: "D:20230615120000",
          ModDate: "D:20230620150000",
        },
        text: "Sample text content that is long enough to be detected",
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.title).toBe("Document Title");
        expect(result.value.metadata.author).toBe("John Doe");
        expect(result.value.metadata.subject).toBe("Test Subject");
        expect(result.value.metadata.keywords).toBe("test, pdf, keywords");
        expect(result.value.metadata.creator).toBe("Test App");
        expect(result.value.metadata.producer).toBe("PDF Library");
        expect(result.value.metadata.creationDate).toBeInstanceOf(Date);
        expect(result.value.metadata.modificationDate).toBeInstanceOf(Date);
        expect(result.value.metadata.pageCount).toBe(1);
      }
    });

    it("returns STORAGE_ERROR when download fails", async () => {
      mockStorage.download.mockResolvedValue(
        err(new StorageError("NOT_FOUND", "File not found"))
      );

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORAGE_ERROR");
        expect(result.error.message).toContain("Failed to download");
      }
    });

    it("returns ENCRYPTED_PDF for password-protected PDFs", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("encrypted pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockRejectedValue(
        new Error("PDF is encrypted and cannot be opened")
      );

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ENCRYPTED_PDF");
        expect(result.error.message).toContain("password-protected");
      }
    });

    it("returns INVALID_PDF for non-PDF files", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("not a pdf file"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockRejectedValue(new Error("Invalid PDF structure"));

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PDF");
        expect(result.error.message).toContain("not a valid PDF");
      }
    });

    it("returns EMPTY_PDF for zero-page PDFs", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("empty pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockResolvedValue({
        numpages: 0,
        info: {},
        text: "",
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("EMPTY_PDF");
        expect(result.error.message).toContain("no pages");
      }
    });

    it("detects scanned PDFs via hasExtractedText flag", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("scanned pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockImplementation(async (_buffer, options) => {
        // Simulate page with minimal text (like a scanned page)
        if (options?.pagerender) {
          await options.pagerender({
            getTextContent: async () => ({
              items: [{ str: "   " }], // Very little text
            }),
          });
        }

        return {
          numpages: 5,
          info: {},
          text: "   ",
        };
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hasExtractedText).toBe(false);
      }
    });

    it("detects PDFs with sufficient text", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("text pdf"),
          contentType: "application/pdf",
        })
      );

      const longText = "This is a sufficiently long text content that should be detected as having extracted text from the PDF document.";

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockImplementation(async (_buffer, options) => {
        if (options?.pagerender) {
          await options.pagerender({
            getTextContent: async () => ({
              items: [{ str: longText }],
            }),
          });
        }

        return {
          numpages: 1,
          info: {},
          text: longText,
        };
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hasExtractedText).toBe(true);
      }
    });

    it("respects maxPages option", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockImplementation(async (_buffer, options) => {
        expect(options?.max).toBe(5);
        return {
          numpages: 5,
          info: {},
          text: "content",
        };
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const options: PdfProcessorOptions = { maxPages: 5 };
      await processor.process("campaign-1", "doc-1", options);
    });

    it("uses custom pageDelimiter option", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockImplementation(async (_buffer, options) => {
        const pageTexts = ["Page 1", "Page 2"];
        for (const text of pageTexts) {
          if (options?.pagerender) {
            await options.pagerender({
              getTextContent: async () => ({
                items: [{ str: text }],
              }),
            });
          }
        }

        return {
          numpages: 2,
          info: {},
          text: "content",
        };
      });

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const customDelimiter = "\n[PAGE {n}]\n";
      const result = await processor.process("campaign-1", "doc-1", {
        pageDelimiter: customDelimiter,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain("[PAGE 2]");
      }
    });

    it("returns PARSE_ERROR for generic parsing failures", async () => {
      mockStorage.download.mockResolvedValue(
        ok({
          content: Buffer.from("broken pdf"),
          contentType: "application/pdf",
        })
      );

      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockRejectedValue(new Error("Unknown parsing error"));

      const processor = createPdfProcessor(
        createMockDeps() as Parameters<typeof createPdfProcessor>[0]
      );
      const result = await processor.process("campaign-1", "doc-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("Failed to parse PDF");
      }
    });
  });

  describe("extractPdfMetadata", () => {
    it("extracts metadata from buffer", async () => {
      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockResolvedValue({
        numpages: 10,
        info: {
          Title: "Test Document",
          Author: "Test Author",
        },
        text: "",
      });

      const result = await extractPdfMetadata(Buffer.from("pdf content"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe("Test Document");
        expect(result.value.author).toBe("Test Author");
        expect(result.value.pageCount).toBe(10);
      }
    });

    it("returns error for encrypted PDF", async () => {
      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockRejectedValue(new Error("PDF is encrypted"));

      const result = await extractPdfMetadata(Buffer.from("encrypted"));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ENCRYPTED_PDF");
      }
    });

    it("returns error for invalid PDF", async () => {
      const mockPdfMock = pdf as unknown as Mock;
      mockPdfMock.mockRejectedValue(new Error("Invalid PDF structure"));

      const result = await extractPdfMetadata(Buffer.from("not a pdf"));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PDF");
      }
    });
  });
});
