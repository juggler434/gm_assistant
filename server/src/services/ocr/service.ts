// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OCR Service Client
 *
 * Sends PDF buffers to the external OCR service (ocrmypdf) for text-layer
 * extraction. The service is optional — `isOcrEnabled()` returns false when
 * `OCR_SERVICE_URL` is not configured.
 */

import { config } from "@/config/index.js";
import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";

/** Error codes for OCR operations */
export type OcrErrorCode =
  | "OCR_DISABLED"
  | "OCR_REQUEST_FAILED"
  | "OCR_TIMEOUT"
  | "OCR_CANCELLED";

/** Structured OCR error */
export interface OcrError {
  code: OcrErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Check whether the OCR service is configured and available.
 */
export function isOcrEnabled(): boolean {
  return !!config.ocr.serviceUrl;
}

/**
 * Send a PDF buffer to the OCR service and return the OCR'd PDF buffer.
 */
export async function ocrPdf(
  buffer: Buffer,
  signal?: AbortSignal,
): Promise<Result<Buffer, OcrError>> {
  if (!config.ocr.serviceUrl) {
    return err({
      code: "OCR_DISABLED",
      message: "OCR service is not configured",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.ocr.timeout);

  const onAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: "application/pdf" }), "input.pdf");

    const response = await fetch(`${config.ocr.serviceUrl}/ocr`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return err({
        code: "OCR_REQUEST_FAILED",
        message: `OCR service returned ${response.status}: ${body}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return ok(Buffer.from(arrayBuffer));
  } catch (error) {
    if (signal?.aborted) {
      return err({
        code: "OCR_CANCELLED",
        message: "OCR request was cancelled",
      });
    }
    if (controller.signal.aborted) {
      return err({
        code: "OCR_TIMEOUT",
        message: `OCR request timed out after ${config.ocr.timeout}ms`,
      });
    }
    return err({
      code: "OCR_REQUEST_FAILED",
      message: error instanceof Error
        ? `OCR request error: ${error.message}`
        : "OCR request failed",
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}
