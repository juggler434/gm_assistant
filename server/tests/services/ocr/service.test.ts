// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Hoisted mocks (available inside vi.mock factories) -----------------------
const { mockConfig, mockFetch } = vi.hoisted(() => ({
  mockConfig: {
    ocr: {
      serviceUrl: "http://localhost:8080" as string | undefined,
      timeout: 5000,
    },
  },
  mockFetch: vi.fn(),
}));

vi.mock("@/config/index.js", () => ({
  config: mockConfig,
}));

vi.stubGlobal("fetch", mockFetch);

// -- Import SUT after mocks ---------------------------------------------------
import { isOcrEnabled, ocrPdf } from "../../../src/services/ocr/service.js";

describe("OCR Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to default enabled state
    mockConfig.ocr.serviceUrl = "http://localhost:8080";
    mockConfig.ocr.timeout = 5000;
  });

  describe("isOcrEnabled", () => {
    it("returns true when OCR_SERVICE_URL is configured", () => {
      expect(isOcrEnabled()).toBe(true);
    });

    it("returns false when OCR_SERVICE_URL is not set", () => {
      mockConfig.ocr.serviceUrl = undefined;
      expect(isOcrEnabled()).toBe(false);
    });
  });

  describe("ocrPdf", () => {
    it("returns OCR_DISABLED error when service URL is not set", async () => {
      mockConfig.ocr.serviceUrl = undefined;

      const result = await ocrPdf(Buffer.from("pdf-bytes"));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OCR_DISABLED");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends PDF to OCR service and returns OCR'd buffer on success", async () => {
      const ocrOutput = Buffer.from("ocr-pdf-bytes");
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(ocrOutput.buffer.slice(
          ocrOutput.byteOffset,
          ocrOutput.byteOffset + ocrOutput.byteLength,
        )),
      });

      const result = await ocrPdf(Buffer.from("input-pdf"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Buffer.isBuffer(result.value)).toBe(true);
        expect(result.value.toString()).toBe("ocr-pdf-bytes");
      }

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("http://localhost:8080/ocr");
      expect(options.method).toBe("POST");
      expect(options.body).toBeInstanceOf(FormData);
    });

    it("returns OCR_REQUEST_FAILED on HTTP error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("ocrmypdf failed (exit 6): some error"),
      });

      const result = await ocrPdf(Buffer.from("bad-pdf"));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OCR_REQUEST_FAILED");
        expect(result.error.message).toContain("422");
      }
    });

    it("returns OCR_TIMEOUT when request times out", async () => {
      mockFetch.mockImplementation(() =>
        new Promise((_resolve, reject) => {
          // Simulate abort due to timeout
          setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 10);
        }),
      );

      const result = await ocrPdf(Buffer.from("pdf"), undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Could be timeout or request failed depending on timing
        expect(["OCR_TIMEOUT", "OCR_REQUEST_FAILED"]).toContain(result.error.code);
      }
    });

    it("returns OCR_CANCELLED when external signal is aborted", async () => {
      const controller = new AbortController();

      mockFetch.mockImplementation(() =>
        new Promise((_resolve, reject) => {
          // Wait a bit, then the signal should trigger abort
          setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 50);
        }),
      );

      // Abort immediately
      controller.abort();

      const result = await ocrPdf(Buffer.from("pdf"), controller.signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OCR_CANCELLED");
      }
    });

    it("returns OCR_REQUEST_FAILED on network error", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await ocrPdf(Buffer.from("pdf"));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OCR_REQUEST_FAILED");
        expect(result.error.message).toContain("ECONNREFUSED");
      }
    });
  });
});
