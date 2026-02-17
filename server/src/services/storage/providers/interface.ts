// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Storage Provider Interface
 *
 * Defines the contract that all storage providers must implement.
 */

import type { Result } from "@/types/index.js";
import type { StorageError } from "../errors.js";
import type {
  UploadRequest,
  UploadResponse,
  DownloadRequest,
  DownloadResponse,
  DeleteRequest,
  SignedUrlRequest,
  SignedUrlResponse,
  ExistsRequest,
  ListRequest,
  ListResponse,
} from "../types.js";

/** Interface for storage providers */
export interface StorageProvider {
  /** Provider name (e.g., "s3", "minio", "local") */
  readonly name: string;

  /**
   * Upload a file to storage.
   * @param request - The upload request
   * @returns Result with response or error
   */
  upload(request: UploadRequest): Promise<Result<UploadResponse, StorageError>>;

  /**
   * Download a file from storage.
   * @param request - The download request
   * @returns Result with response or error
   */
  download(
    request: DownloadRequest
  ): Promise<Result<DownloadResponse, StorageError>>;

  /**
   * Delete a file from storage.
   * @param request - The delete request
   * @returns Result with success or error
   */
  delete(request: DeleteRequest): Promise<Result<void, StorageError>>;

  /**
   * Generate a presigned URL for downloading a file.
   * @param request - The signed URL request
   * @returns Result with signed URL or error
   */
  getSignedUrl(
    request: SignedUrlRequest
  ): Promise<Result<SignedUrlResponse, StorageError>>;

  /**
   * Check if a file exists in storage.
   * @param request - The exists request
   * @returns Result with boolean or error
   */
  exists(request: ExistsRequest): Promise<Result<boolean, StorageError>>;

  /**
   * List files in storage.
   * @param request - The list request
   * @returns Result with list response or error
   */
  list(request: ListRequest): Promise<Result<ListResponse, StorageError>>;

  /**
   * Check if the storage provider is healthy and reachable.
   * @returns true if healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;

  /**
   * Ensure the bucket exists, creating it if necessary.
   * @returns Result with success or error
   */
  ensureBucket(): Promise<Result<void, StorageError>>;
}
