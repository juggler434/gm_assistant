// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { StorageError } from "../../../src/services/storage/errors.js";

describe("StorageError", () => {
  describe("constructor", () => {
    it("should create error with all properties", () => {
      const cause = new Error("Original error");
      const error = new StorageError("Test error", "UPLOAD_FAILED", {
        statusCode: 500,
        key: "test-key",
        cause,
      });

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("UPLOAD_FAILED");
      expect(error.statusCode).toBe(500);
      expect(error.key).toBe("test-key");
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("StorageError");
    });

    it("should create error without optional properties", () => {
      const error = new StorageError("Test error", "UNKNOWN");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("UNKNOWN");
      expect(error.statusCode).toBeUndefined();
      expect(error.key).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });
  });

  describe("static factory methods", () => {
    it("should create notFound error", () => {
      const error = StorageError.notFound("campaigns/123/documents/456");

      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.key).toBe("campaigns/123/documents/456");
      expect(error.message).toContain("campaigns/123/documents/456");
    });

    it("should create accessDenied error with key", () => {
      const error = StorageError.accessDenied("test-key");

      expect(error.code).toBe("ACCESS_DENIED");
      expect(error.statusCode).toBe(403);
      expect(error.key).toBe("test-key");
      expect(error.message).toContain("test-key");
    });

    it("should create accessDenied error without key", () => {
      const error = StorageError.accessDenied();

      expect(error.code).toBe("ACCESS_DENIED");
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Access denied to storage");
    });

    it("should create bucketNotFound error", () => {
      const error = StorageError.bucketNotFound("my-bucket");

      expect(error.code).toBe("BUCKET_NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain("my-bucket");
    });

    it("should create invalidKey error", () => {
      const error = StorageError.invalidKey("key cannot be empty");

      expect(error.code).toBe("INVALID_KEY");
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("key cannot be empty");
    });

    it("should create uploadFailed error", () => {
      const cause = new Error("Network error");
      const error = StorageError.uploadFailed("test-key", cause);

      expect(error.code).toBe("UPLOAD_FAILED");
      expect(error.statusCode).toBe(500);
      expect(error.key).toBe("test-key");
      expect(error.cause).toBe(cause);
    });

    it("should create downloadFailed error", () => {
      const error = StorageError.downloadFailed("test-key");

      expect(error.code).toBe("DOWNLOAD_FAILED");
      expect(error.statusCode).toBe(500);
      expect(error.key).toBe("test-key");
    });

    it("should create deleteFailed error", () => {
      const error = StorageError.deleteFailed("test-key");

      expect(error.code).toBe("DELETE_FAILED");
      expect(error.statusCode).toBe(500);
      expect(error.key).toBe("test-key");
    });

    it("should create connectionError error", () => {
      const cause = new Error("ECONNREFUSED");
      const error = StorageError.connectionError("http://localhost:9000", cause);

      expect(error.code).toBe("CONNECTION_ERROR");
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain("localhost:9000");
      expect(error.cause).toBe(cause);
    });
  });

  describe("fromUnknown", () => {
    it("should return existing StorageError unchanged", () => {
      const original = StorageError.notFound("test-key");
      const result = StorageError.fromUnknown(original);

      expect(result).toBe(original);
    });

    it("should convert NoSuchKey AWS error", () => {
      const awsError = { name: "NoSuchKey", message: "Key not found" };
      const result = StorageError.fromUnknown(awsError, "test-key");

      expect(result.code).toBe("NOT_FOUND");
      expect(result.key).toBe("test-key");
    });

    it("should convert NoSuchBucket AWS error", () => {
      const awsError = { name: "NoSuchBucket" };
      const result = StorageError.fromUnknown(awsError);

      expect(result.code).toBe("BUCKET_NOT_FOUND");
    });

    it("should convert AccessDenied AWS error", () => {
      const awsError = { name: "AccessDenied" };
      const result = StorageError.fromUnknown(awsError, "test-key");

      expect(result.code).toBe("ACCESS_DENIED");
    });

    it("should convert InvalidAccessKeyId AWS error", () => {
      const awsError = { name: "InvalidAccessKeyId" };
      const result = StorageError.fromUnknown(awsError);

      expect(result.code).toBe("ACCESS_DENIED");
    });

    it("should convert SignatureDoesNotMatch AWS error", () => {
      const awsError = { name: "SignatureDoesNotMatch" };
      const result = StorageError.fromUnknown(awsError);

      expect(result.code).toBe("ACCESS_DENIED");
    });

    it("should convert regular Error", () => {
      const error = new Error("Something went wrong");
      const result = StorageError.fromUnknown(error, "test-key");

      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("Something went wrong");
      expect(result.cause).toBe(error);
      expect(result.key).toBe("test-key");
    });

    it("should handle non-Error objects", () => {
      const result = StorageError.fromUnknown("string error");

      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("An unknown storage error occurred");
    });
  });

  describe("toJSON", () => {
    it("should serialize error to JSON", () => {
      const error = new StorageError("Test error", "UPLOAD_FAILED", {
        statusCode: 500,
        key: "test-key",
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: "StorageError",
        message: "Test error",
        code: "UPLOAD_FAILED",
        statusCode: 500,
        key: "test-key",
      });
    });

    it("should handle undefined optional fields", () => {
      const error = new StorageError("Test error", "UNKNOWN");
      const json = error.toJSON();

      expect(json.statusCode).toBeUndefined();
      expect(json.key).toBeUndefined();
    });
  });
});
