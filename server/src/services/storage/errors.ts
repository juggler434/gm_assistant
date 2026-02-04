/**
 * Storage Error Types
 */

/** Error codes for storage operations */
export type StorageErrorCode =
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "BUCKET_NOT_FOUND"
  | "INVALID_KEY"
  | "UPLOAD_FAILED"
  | "DOWNLOAD_FAILED"
  | "DELETE_FAILED"
  | "CONNECTION_ERROR"
  | "UNKNOWN";

/** Structured error for storage operations */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly statusCode: number | undefined;
  readonly key: string | undefined;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    code: StorageErrorCode,
    options?: {
      statusCode?: number | undefined;
      key?: string | undefined;
      cause?: Error | undefined;
    }
  ) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.key = options?.key;
    this.cause = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }

  /** Create a not found error */
  static notFound(key: string): StorageError {
    return new StorageError(`Object not found: ${key}`, "NOT_FOUND", {
      statusCode: 404,
      key,
    });
  }

  /** Create an access denied error */
  static accessDenied(key?: string): StorageError {
    const message = key
      ? `Access denied to object: ${key}`
      : "Access denied to storage";
    return new StorageError(message, "ACCESS_DENIED", {
      statusCode: 403,
      key,
    });
  }

  /** Create a bucket not found error */
  static bucketNotFound(bucket: string): StorageError {
    return new StorageError(`Bucket not found: ${bucket}`, "BUCKET_NOT_FOUND", {
      statusCode: 404,
    });
  }

  /** Create an invalid key error */
  static invalidKey(reason: string): StorageError {
    return new StorageError(`Invalid object key: ${reason}`, "INVALID_KEY", {
      statusCode: 400,
    });
  }

  /** Create an upload failed error */
  static uploadFailed(key: string, cause?: Error): StorageError {
    return new StorageError(`Failed to upload object: ${key}`, "UPLOAD_FAILED", {
      statusCode: 500,
      key,
      cause,
    });
  }

  /** Create a download failed error */
  static downloadFailed(key: string, cause?: Error): StorageError {
    return new StorageError(
      `Failed to download object: ${key}`,
      "DOWNLOAD_FAILED",
      {
        statusCode: 500,
        key,
        cause,
      }
    );
  }

  /** Create a delete failed error */
  static deleteFailed(key: string, cause?: Error): StorageError {
    return new StorageError(`Failed to delete object: ${key}`, "DELETE_FAILED", {
      statusCode: 500,
      key,
      cause,
    });
  }

  /** Create a connection error */
  static connectionError(endpoint: string, cause?: Error): StorageError {
    return new StorageError(
      `Failed to connect to storage at ${endpoint}`,
      "CONNECTION_ERROR",
      { statusCode: 503, cause }
    );
  }

  /** Convert an unknown error to StorageError */
  static fromUnknown(error: unknown, key?: string): StorageError {
    if (error instanceof StorageError) {
      return error;
    }

    // Handle AWS SDK errors
    if (error && typeof error === "object" && "name" in error) {
      const awsError = error as { name: string; message?: string };

      switch (awsError.name) {
        case "NoSuchKey":
          return StorageError.notFound(key ?? "unknown");
        case "NoSuchBucket":
          return StorageError.bucketNotFound("unknown");
        case "AccessDenied":
        case "InvalidAccessKeyId":
        case "SignatureDoesNotMatch":
          return StorageError.accessDenied(key);
      }
    }

    const message =
      error instanceof Error ? error.message : "An unknown storage error occurred";

    return new StorageError(message, "UNKNOWN", {
      key,
      cause: error instanceof Error ? error : undefined,
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      key: this.key,
    };
  }
}
