/**
 * S3 Storage Provider
 *
 * Works with both AWS S3 and MinIO (S3-compatible).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ok, err } from "@/types/index.js";
import type { Result } from "@/types/index.js";
import { StorageError } from "../errors.js";
import type {
  StorageConfig,
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
  FileInfo,
} from "../types.js";
import type { StorageProvider } from "./interface.js";

/** Default signed URL expiration (1 hour) */
const DEFAULT_EXPIRES_IN = 3600;

export class S3Provider implements StorageProvider {
  readonly name = "s3";

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  /**
   * Build the object key from campaign and document IDs.
   * Format: campaigns/{campaignId}/documents/{documentId}
   */
  private buildKey(campaignId: string, documentId: string): string {
    return `campaigns/${campaignId}/documents/${documentId}`;
  }

  /**
   * Resolve the object key from request parameters.
   */
  private resolveKey(request: {
    key?: string | undefined;
    campaignId?: string | undefined;
    documentId?: string | undefined;
  }): Result<string, StorageError> {
    if (request.key) {
      return ok(request.key);
    }

    if (request.campaignId && request.documentId) {
      return ok(this.buildKey(request.campaignId, request.documentId));
    }

    return err(
      StorageError.invalidKey("Must provide either key or campaignId and documentId")
    );
  }

  async upload(
    request: UploadRequest
  ): Promise<Result<UploadResponse, StorageError>> {
    const key = this.buildKey(request.campaignId, request.documentId);

    try {
      // Convert NodeJS.ReadableStream to a format the SDK accepts
      const body = request.content;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body as Buffer,
        ContentType: request.metadata?.contentType,
        ContentLength: request.metadata?.contentLength,
        Metadata: request.metadata?.metadata,
      });

      const response = await this.client.send(command);

      const result: UploadResponse = {
        key,
        bucket: this.bucket,
      };

      if (response.ETag) {
        result.etag = response.ETag.replace(/"/g, "");
      }

      return ok(result);
    } catch (error) {
      return err(StorageError.fromUnknown(error, key));
    }
  }

  async download(
    request: DownloadRequest
  ): Promise<Result<DownloadResponse, StorageError>> {
    const keyResult = this.resolveKey(request);
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return err(StorageError.downloadFailed(key));
      }

      // Convert the response body to Buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);

      const result: DownloadResponse = {
        content,
      };

      if (response.ContentType !== undefined) {
        result.contentType = response.ContentType;
      }
      if (response.ContentLength !== undefined) {
        result.contentLength = response.ContentLength;
      }
      if (response.Metadata !== undefined) {
        result.metadata = response.Metadata;
      }

      return ok(result);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "NoSuchKey"
      ) {
        return err(StorageError.notFound(key));
      }
      return err(StorageError.fromUnknown(error, key));
    }
  }

  async delete(request: DeleteRequest): Promise<Result<void, StorageError>> {
    const keyResult = this.resolveKey(request);
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return ok(undefined);
    } catch (error) {
      return err(StorageError.fromUnknown(error, key));
    }
  }

  async getSignedUrl(
    request: SignedUrlRequest
  ): Promise<Result<SignedUrlResponse, StorageError>> {
    const keyResult = this.resolveKey(request);
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    try {
      const expiresIn = request.expiresIn ?? DEFAULT_EXPIRES_IN;

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return ok({ url, expiresAt });
    } catch (error) {
      return err(StorageError.fromUnknown(error, key));
    }
  }

  async exists(request: ExistsRequest): Promise<Result<boolean, StorageError>> {
    const keyResult = this.resolveKey(request);
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return ok(true);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        return ok(false);
      }
      return err(StorageError.fromUnknown(error, key));
    }
  }

  async list(request: ListRequest): Promise<Result<ListResponse, StorageError>> {
    try {
      let prefix = request.prefix;

      // Build prefix from campaignId if provided
      if (!prefix && request.campaignId) {
        prefix = `campaigns/${request.campaignId}/`;
      }

      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: request.maxKeys,
        ContinuationToken: request.continuationToken,
      });

      const response = await this.client.send(command);

      const files: FileInfo[] = (response.Contents ?? []).map((obj) => {
        const fileInfo: FileInfo = {
          key: obj.Key!,
        };

        if (obj.LastModified !== undefined) {
          fileInfo.lastModified = obj.LastModified;
        }
        if (obj.Size !== undefined) {
          fileInfo.size = obj.Size;
        }
        if (obj.ETag !== undefined) {
          fileInfo.etag = obj.ETag.replace(/"/g, "");
        }

        return fileInfo;
      });

      const result: ListResponse = {
        files,
        isTruncated: response.IsTruncated ?? false,
      };

      if (response.NextContinuationToken !== undefined) {
        result.continuationToken = response.NextContinuationToken;
      }

      return ok(result);
    } catch (error) {
      return err(StorageError.fromUnknown(error));
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucket,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async ensureBucket(): Promise<Result<void, StorageError>> {
    try {
      // Check if bucket exists
      const headCommand = new HeadBucketCommand({
        Bucket: this.bucket,
      });

      try {
        await this.client.send(headCommand);
        return ok(undefined);
      } catch (error) {
        // Bucket doesn't exist, try to create it
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error.name === "NotFound" || error.name === "NoSuchBucket")
        ) {
          const createCommand = new CreateBucketCommand({
            Bucket: this.bucket,
          });

          await this.client.send(createCommand);
          return ok(undefined);
        }

        throw error;
      }
    } catch (error) {
      return err(StorageError.fromUnknown(error));
    }
  }
}
