// SPDX-License-Identifier: AGPL-3.0-or-later

import { ApiError } from "@/lib/api-client";
import type { ApiErrorResponse } from "@/types";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadOptions {
  url: string;
  formData: FormData;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Upload a file via XMLHttpRequest with progress tracking.
 * Uses XHR instead of fetch because fetch doesn't support upload progress events.
 */
export function uploadWithProgress<T>(options: UploadOptions): Promise<T> {
  const { url, formData, onProgress, signal } = options;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve(undefined as T);
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as ApiErrorResponse;
          reject(new ApiError(body));
        } catch {
          reject(
            new ApiError({
              statusCode: xhr.status,
              error: xhr.statusText,
              message: "An unexpected error occurred",
            })
          );
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(
        new ApiError({
          statusCode: 0,
          error: "NetworkError",
          message: "Network error occurred during upload",
        })
      );
    });

    xhr.addEventListener("abort", () => {
      reject(new DOMException("Upload cancelled", "AbortError"));
    });

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}
