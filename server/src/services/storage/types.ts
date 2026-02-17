// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Storage Service Types
 */

import type { Readable } from "node:stream";

/** Storage configuration */
export interface StorageConfig {
  /** S3-compatible endpoint URL */
  endpoint: string;
  /** Bucket name */
  bucket: string;
  /** Access key */
  accessKey: string;
  /** Secret key */
  secretKey: string;
  /** Region (defaults to us-east-1 for MinIO compatibility) */
  region?: string | undefined;
  /** Force path style for MinIO compatibility */
  forcePathStyle?: boolean | undefined;
}

/** File metadata */
export interface FileMetadata {
  /** Content type (MIME type) */
  contentType?: string | undefined;
  /** Content length in bytes */
  contentLength?: number | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
}

/** Upload request */
export interface UploadRequest {
  /** Campaign ID for path organization */
  campaignId: string;
  /** Document ID for path organization */
  documentId: string;
  /** File content as Buffer or stream */
  content: Buffer | Readable;
  /** File metadata */
  metadata?: FileMetadata | undefined;
}

/** Upload response */
export interface UploadResponse {
  /** The full object key in storage */
  key: string;
  /** ETag of the uploaded object */
  etag?: string | undefined;
  /** Bucket name */
  bucket: string;
}

/** Download request */
export interface DownloadRequest {
  /** The full object key or campaign/document IDs */
  key?: string | undefined;
  /** Campaign ID (used if key not provided) */
  campaignId?: string | undefined;
  /** Document ID (used if key not provided) */
  documentId?: string | undefined;
}

/** Download response */
export interface DownloadResponse {
  /** File content as Buffer */
  content: Buffer;
  /** Content type */
  contentType?: string | undefined;
  /** Content length in bytes */
  contentLength?: number | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
}

/** Delete request */
export interface DeleteRequest {
  /** The full object key or campaign/document IDs */
  key?: string | undefined;
  /** Campaign ID (used if key not provided) */
  campaignId?: string | undefined;
  /** Document ID (used if key not provided) */
  documentId?: string | undefined;
}

/** Signed URL request */
export interface SignedUrlRequest {
  /** The full object key or campaign/document IDs */
  key?: string | undefined;
  /** Campaign ID (used if key not provided) */
  campaignId?: string | undefined;
  /** Document ID (used if key not provided) */
  documentId?: string | undefined;
  /** URL expiration time in seconds (default: 3600 = 1 hour) */
  expiresIn?: number | undefined;
}

/** Signed URL response */
export interface SignedUrlResponse {
  /** The presigned URL */
  url: string;
  /** When the URL expires */
  expiresAt: Date;
}

/** File existence check request */
export interface ExistsRequest {
  /** The full object key or campaign/document IDs */
  key?: string | undefined;
  /** Campaign ID (used if key not provided) */
  campaignId?: string | undefined;
  /** Document ID (used if key not provided) */
  documentId?: string | undefined;
}

/** List files request */
export interface ListRequest {
  /** Prefix to filter objects (e.g., campaigns/{campaignId}/) */
  prefix?: string | undefined;
  /** Campaign ID to list all documents for */
  campaignId?: string | undefined;
  /** Maximum number of objects to return */
  maxKeys?: number | undefined;
  /** Continuation token for pagination */
  continuationToken?: string | undefined;
}

/** File info in list response */
export interface FileInfo {
  /** Object key */
  key: string;
  /** Last modified date */
  lastModified?: Date | undefined;
  /** Size in bytes */
  size?: number | undefined;
  /** ETag */
  etag?: string | undefined;
}

/** List files response */
export interface ListResponse {
  /** List of files */
  files: FileInfo[];
  /** Whether there are more results */
  isTruncated: boolean;
  /** Token to continue pagination */
  continuationToken?: string | undefined;
}
