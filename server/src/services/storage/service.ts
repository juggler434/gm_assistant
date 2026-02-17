// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Storage Service
 *
 * High-level service for file storage operations.
 * Wraps the storage provider with additional logging and convenience methods.
 */

import type { Readable } from "node:stream";
import type { Result } from "@/types/index.js";
import type { StorageError } from "./errors.js";
import type { StorageProvider } from "./providers/interface.js";
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
  FileMetadata,
} from "./types.js";

/** Logger interface for storage operations */
export interface StorageLogger {
  debug?: ((message: string, data?: Record<string, unknown>) => void) | undefined;
  info?: ((message: string, data?: Record<string, unknown>) => void) | undefined;
  warn?: ((message: string, data?: Record<string, unknown>) => void) | undefined;
  error?: ((message: string, data?: Record<string, unknown>) => void) | undefined;
}

/** Storage service options */
export interface StorageServiceOptions {
  /** Optional logger for debugging */
  logger?: StorageLogger | undefined;
}

export class StorageService {
  private readonly provider: StorageProvider;
  private readonly logger: StorageLogger | undefined;

  constructor(provider: StorageProvider, options?: StorageServiceOptions) {
    this.provider = provider;
    this.logger = options?.logger;
  }

  /** Get the provider name */
  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Upload a file to storage.
   * Files are organized by campaign: campaigns/{campaignId}/documents/{documentId}
   */
  async upload(
    campaignId: string,
    documentId: string,
    content: Buffer | Readable,
    metadata?: FileMetadata
  ): Promise<Result<UploadResponse, StorageError>> {
    const startTime = Date.now();

    this.logger?.debug?.("Starting upload", {
      campaignId,
      documentId,
      contentType: metadata?.contentType,
    });

    const request: UploadRequest = {
      campaignId,
      documentId,
      content,
    };

    if (metadata !== undefined) {
      request.metadata = metadata;
    }

    const result = await this.provider.upload(request);

    const durationMs = Date.now() - startTime;

    if (result.ok) {
      this.logger?.info?.("Upload completed", {
        key: result.value.key,
        durationMs,
      });
    } else {
      this.logger?.error?.("Upload failed", {
        campaignId,
        documentId,
        error: result.error.message,
        code: result.error.code,
      });
    }

    return result;
  }

  /**
   * Download a file from storage.
   */
  async download(
    campaignId: string,
    documentId: string
  ): Promise<Result<DownloadResponse, StorageError>> {
    const startTime = Date.now();

    this.logger?.debug?.("Starting download", { campaignId, documentId });

    const request: DownloadRequest = { campaignId, documentId };
    const result = await this.provider.download(request);

    const durationMs = Date.now() - startTime;

    if (result.ok) {
      this.logger?.info?.("Download completed", {
        campaignId,
        documentId,
        contentLength: result.value.contentLength,
        durationMs,
      });
    } else {
      this.logger?.error?.("Download failed", {
        campaignId,
        documentId,
        error: result.error.message,
        code: result.error.code,
      });
    }

    return result;
  }

  /**
   * Download a file by its full key.
   */
  async downloadByKey(
    key: string
  ): Promise<Result<DownloadResponse, StorageError>> {
    this.logger?.debug?.("Starting download by key", { key });
    return this.provider.download({ key });
  }

  /**
   * Delete a file from storage.
   */
  async delete(
    campaignId: string,
    documentId: string
  ): Promise<Result<void, StorageError>> {
    this.logger?.debug?.("Starting delete", { campaignId, documentId });

    const request: DeleteRequest = { campaignId, documentId };
    const result = await this.provider.delete(request);

    if (result.ok) {
      this.logger?.info?.("Delete completed", { campaignId, documentId });
    } else {
      this.logger?.error?.("Delete failed", {
        campaignId,
        documentId,
        error: result.error.message,
        code: result.error.code,
      });
    }

    return result;
  }

  /**
   * Delete a file by its full key.
   */
  async deleteByKey(key: string): Promise<Result<void, StorageError>> {
    this.logger?.debug?.("Starting delete by key", { key });
    return this.provider.delete({ key });
  }

  /**
   * Get a presigned URL for downloading a file.
   * URLs expire after the specified time (default: 1 hour).
   */
  async getSignedUrl(
    campaignId: string,
    documentId: string,
    expiresIn?: number
  ): Promise<Result<SignedUrlResponse, StorageError>> {
    this.logger?.debug?.("Generating signed URL", {
      campaignId,
      documentId,
      expiresIn,
    });

    const request: SignedUrlRequest = { campaignId, documentId };
    if (expiresIn !== undefined) {
      request.expiresIn = expiresIn;
    }

    const result = await this.provider.getSignedUrl(request);

    if (result.ok) {
      this.logger?.info?.("Signed URL generated", {
        campaignId,
        documentId,
        expiresAt: result.value.expiresAt.toISOString(),
      });
    } else {
      this.logger?.error?.("Signed URL generation failed", {
        campaignId,
        documentId,
        error: result.error.message,
        code: result.error.code,
      });
    }

    return result;
  }

  /**
   * Get a presigned URL by full key.
   */
  async getSignedUrlByKey(
    key: string,
    expiresIn?: number
  ): Promise<Result<SignedUrlResponse, StorageError>> {
    this.logger?.debug?.("Generating signed URL by key", { key, expiresIn });

    const request: SignedUrlRequest = { key };
    if (expiresIn !== undefined) {
      request.expiresIn = expiresIn;
    }

    return this.provider.getSignedUrl(request);
  }

  /**
   * Check if a file exists in storage.
   */
  async exists(
    campaignId: string,
    documentId: string
  ): Promise<Result<boolean, StorageError>> {
    this.logger?.debug?.("Checking existence", { campaignId, documentId });

    const request: ExistsRequest = { campaignId, documentId };
    return this.provider.exists(request);
  }

  /**
   * Check if a file exists by key.
   */
  async existsByKey(key: string): Promise<Result<boolean, StorageError>> {
    this.logger?.debug?.("Checking existence by key", { key });
    return this.provider.exists({ key });
  }

  /**
   * List all documents for a campaign.
   */
  async listCampaignDocuments(
    campaignId: string,
    options?: { maxKeys?: number; continuationToken?: string }
  ): Promise<Result<ListResponse, StorageError>> {
    this.logger?.debug?.("Listing campaign documents", { campaignId, ...options });

    const request: ListRequest = { campaignId };
    if (options?.maxKeys !== undefined) {
      request.maxKeys = options.maxKeys;
    }
    if (options?.continuationToken !== undefined) {
      request.continuationToken = options.continuationToken;
    }

    return this.provider.list(request);
  }

  /**
   * List files with a custom prefix.
   */
  async list(
    options?: ListRequest
  ): Promise<Result<ListResponse, StorageError>> {
    if (options) {
      this.logger?.debug?.("Listing files", {
        prefix: options.prefix,
        campaignId: options.campaignId,
        maxKeys: options.maxKeys,
      });
    } else {
      this.logger?.debug?.("Listing files");
    }
    return this.provider.list(options ?? {});
  }

  /**
   * Check if the storage service is healthy.
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  /**
   * Ensure the storage bucket exists.
   * Creates the bucket if it doesn't exist.
   */
  async ensureBucket(): Promise<Result<void, StorageError>> {
    this.logger?.info?.("Ensuring bucket exists");
    return this.provider.ensureBucket();
  }
}
