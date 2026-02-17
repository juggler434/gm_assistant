// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3Provider } from "../../../../src/services/storage/providers/s3.js";
import type { StorageConfig } from "../../../../src/services/storage/types.js";

// Mock the AWS SDK
vi.mock("@aws-sdk/client-s3", () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((input) => ({ _type: "PutObject", input })),
    GetObjectCommand: vi.fn((input) => ({ _type: "GetObject", input })),
    DeleteObjectCommand: vi.fn((input) => ({ _type: "DeleteObject", input })),
    HeadObjectCommand: vi.fn((input) => ({ _type: "HeadObject", input })),
    HeadBucketCommand: vi.fn((input) => ({ _type: "HeadBucket", input })),
    CreateBucketCommand: vi.fn((input) => ({ _type: "CreateBucket", input })),
    ListObjectsV2Command: vi.fn((input) => ({ _type: "ListObjectsV2", input })),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const mockConfig: StorageConfig = {
  endpoint: "http://localhost:9000",
  bucket: "test-bucket",
  accessKey: "test-access-key",
  secretKey: "test-secret-key",
  region: "us-east-1",
  forcePathStyle: true,
};

describe("S3Provider", () => {
  let provider: S3Provider;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new S3Provider(mockConfig);
    // Get the mock send function from the instantiated client
    const clientInstance = vi.mocked(S3Client).mock.results[0]?.value;
    mockSend = clientInstance?.send;
  });

  describe("constructor", () => {
    it("should set provider name to s3", () => {
      expect(provider.name).toBe("s3");
    });

    it("should use default region when not provided", () => {
      const configWithoutRegion: StorageConfig = {
        endpoint: "http://localhost:9000",
        bucket: "test-bucket",
        accessKey: "test-access-key",
        secretKey: "test-secret-key",
      };
      const providerWithoutRegion = new S3Provider(configWithoutRegion);
      expect(providerWithoutRegion.name).toBe("s3");
    });
  });

  describe("upload", () => {
    it("should upload file with correct key", async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"abc123"' });

      const content = Buffer.from("test content");
      const result = await provider.upload({
        campaignId: "camp-123",
        documentId: "doc-456",
        content,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe("campaigns/camp-123/documents/doc-456");
        expect(result.value.bucket).toBe("test-bucket");
        expect(result.value.etag).toBe("abc123");
      }
    });

    it("should upload file with metadata", async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"def456"' });

      const content = Buffer.from("test content");
      const result = await provider.upload({
        campaignId: "camp-123",
        documentId: "doc-456",
        content,
        metadata: {
          contentType: "text/plain",
          contentLength: 12,
          metadata: { author: "test-user" },
        },
      });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: "test-bucket",
            Key: "campaigns/camp-123/documents/doc-456",
            ContentType: "text/plain",
            ContentLength: 12,
            Metadata: { author: "test-user" },
          }),
        })
      );
    });

    it("should handle upload without ETag in response", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.upload({
        campaignId: "camp-123",
        documentId: "doc-456",
        content: Buffer.from("test"),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.etag).toBeUndefined();
      }
    });

    it("should return error on upload failure", async () => {
      mockSend.mockRejectedValueOnce(new Error("Network error"));

      const result = await provider.upload({
        campaignId: "camp-123",
        documentId: "doc-456",
        content: Buffer.from("test"),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN");
      }
    });

    it("should return access denied error", async () => {
      const accessError = { name: "AccessDenied", message: "Access denied" };
      mockSend.mockRejectedValueOnce(accessError);

      const result = await provider.upload({
        campaignId: "camp-123",
        documentId: "doc-456",
        content: Buffer.from("test"),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ACCESS_DENIED");
      }
    });
  });

  describe("download", () => {
    function createMockStream(content: string) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      return {
        async *[Symbol.asyncIterator]() {
          yield data;
        },
      };
    }

    it("should download file by campaignId and documentId", async () => {
      mockSend.mockResolvedValueOnce({
        Body: createMockStream("file content"),
        ContentType: "text/plain",
        ContentLength: 12,
        Metadata: { author: "test-user" },
      });

      const result = await provider.download({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content.toString()).toBe("file content");
        expect(result.value.contentType).toBe("text/plain");
        expect(result.value.contentLength).toBe(12);
        expect(result.value.metadata).toEqual({ author: "test-user" });
      }
    });

    it("should download file by key", async () => {
      mockSend.mockResolvedValueOnce({
        Body: createMockStream("test data"),
      });

      const result = await provider.download({
        key: "custom/path/file.txt",
      });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: "custom/path/file.txt",
          }),
        })
      );
    });

    it("should return error when no key or IDs provided", async () => {
      const result = await provider.download({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_KEY");
      }
    });

    it("should return not found error for NoSuchKey", async () => {
      const notFoundError = { name: "NoSuchKey", message: "Key not found" };
      mockSend.mockRejectedValueOnce(notFoundError);

      const result = await provider.download({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("should return error when response body is empty", async () => {
      mockSend.mockResolvedValueOnce({ Body: null });

      const result = await provider.download({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOWNLOAD_FAILED");
      }
    });

    it("should handle response without optional fields", async () => {
      mockSend.mockResolvedValueOnce({
        Body: createMockStream("data"),
      });

      const result = await provider.download({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.contentType).toBeUndefined();
        expect(result.value.contentLength).toBeUndefined();
        expect(result.value.metadata).toBeUndefined();
      }
    });
  });

  describe("delete", () => {
    it("should delete file by campaignId and documentId", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.delete({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: "test-bucket",
            Key: "campaigns/camp-123/documents/doc-456",
          }),
        })
      );
    });

    it("should delete file by key", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.delete({
        key: "custom/path/file.txt",
      });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: "custom/path/file.txt",
          }),
        })
      );
    });

    it("should return error when no key or IDs provided", async () => {
      const result = await provider.delete({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_KEY");
      }
    });

    it("should return error on delete failure", async () => {
      mockSend.mockRejectedValueOnce(new Error("Delete failed"));

      const result = await provider.delete({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN");
      }
    });
  });

  describe("getSignedUrl", () => {
    it("should generate signed URL with default expiration", async () => {
      vi.mocked(getSignedUrl).mockResolvedValueOnce(
        "https://storage.example.com/file?signature=xxx"
      );

      const result = await provider.getSignedUrl({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(
          "https://storage.example.com/file?signature=xxx"
        );
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });

    it("should generate signed URL with custom expiration", async () => {
      vi.mocked(getSignedUrl).mockResolvedValueOnce(
        "https://storage.example.com/file?signature=xxx"
      );

      const result = await provider.getSignedUrl({
        campaignId: "camp-123",
        documentId: "doc-456",
        expiresIn: 7200,
      });

      expect(result.ok).toBe(true);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 }
      );
    });

    it("should generate signed URL by key", async () => {
      vi.mocked(getSignedUrl).mockResolvedValueOnce(
        "https://storage.example.com/file?signature=xxx"
      );

      const result = await provider.getSignedUrl({
        key: "custom/path/file.txt",
      });

      expect(result.ok).toBe(true);
    });

    it("should return error when no key or IDs provided", async () => {
      const result = await provider.getSignedUrl({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_KEY");
      }
    });

    it("should return error on signing failure", async () => {
      vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("Signing failed"));

      const result = await provider.getSignedUrl({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN");
      }
    });
  });

  describe("exists", () => {
    it("should return true when file exists", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.exists({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return false for NoSuchKey error", async () => {
      mockSend.mockRejectedValueOnce({ name: "NoSuchKey" });

      const result = await provider.exists({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should return false for NotFound error", async () => {
      mockSend.mockRejectedValueOnce({ name: "NotFound" });

      const result = await provider.exists({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should check existence by key", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.exists({
        key: "custom/path/file.txt",
      });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: "custom/path/file.txt",
          }),
        })
      );
    });

    it("should return error when no key or IDs provided", async () => {
      const result = await provider.exists({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_KEY");
      }
    });

    it("should return error for other errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("Network error"));

      const result = await provider.exists({
        campaignId: "camp-123",
        documentId: "doc-456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN");
      }
    });
  });

  describe("list", () => {
    it("should list files with campaignId prefix", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          {
            Key: "campaigns/camp-123/documents/doc-1",
            LastModified: new Date("2024-01-01"),
            Size: 100,
            ETag: '"etag1"',
          },
          {
            Key: "campaigns/camp-123/documents/doc-2",
            LastModified: new Date("2024-01-02"),
            Size: 200,
            ETag: '"etag2"',
          },
        ],
        IsTruncated: false,
      });

      const result = await provider.list({ campaignId: "camp-123" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files).toHaveLength(2);
        expect(result.value.files[0].key).toBe(
          "campaigns/camp-123/documents/doc-1"
        );
        expect(result.value.files[0].size).toBe(100);
        expect(result.value.files[0].etag).toBe("etag1");
        expect(result.value.isTruncated).toBe(false);
      }
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Prefix: "campaigns/camp-123/",
          }),
        })
      );
    });

    it("should list files with custom prefix", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "custom/prefix/file.txt" }],
        IsTruncated: false,
      });

      const result = await provider.list({ prefix: "custom/prefix/" });

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Prefix: "custom/prefix/",
          }),
        })
      );
    });

    it("should handle pagination", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "file1.txt" }],
        IsTruncated: true,
        NextContinuationToken: "next-token",
      });

      const result = await provider.list({
        maxKeys: 10,
        continuationToken: "prev-token",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isTruncated).toBe(true);
        expect(result.value.continuationToken).toBe("next-token");
      }
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            MaxKeys: 10,
            ContinuationToken: "prev-token",
          }),
        })
      );
    });

    it("should handle empty list", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });

      const result = await provider.list({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files).toHaveLength(0);
      }
    });

    it("should handle files without optional fields", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "file.txt" }],
        IsTruncated: undefined,
      });

      const result = await provider.list({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files[0].lastModified).toBeUndefined();
        expect(result.value.files[0].size).toBeUndefined();
        expect(result.value.files[0].etag).toBeUndefined();
        expect(result.value.isTruncated).toBe(false);
      }
    });

    it("should return error on list failure", async () => {
      mockSend.mockRejectedValueOnce(new Error("List failed"));

      const result = await provider.list({ campaignId: "camp-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN");
      }
    });
  });

  describe("healthCheck", () => {
    it("should return true when bucket is accessible", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: "test-bucket",
          }),
        })
      );
    });

    it("should return false when bucket is not accessible", async () => {
      mockSend.mockRejectedValueOnce(new Error("Bucket not found"));

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("ensureBucket", () => {
    it("should succeed when bucket already exists", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await provider.ensureBucket();

      expect(result.ok).toBe(true);
    });

    it("should create bucket when NotFound", async () => {
      // First call (HeadBucket) throws NotFound
      mockSend.mockRejectedValueOnce({ name: "NotFound" });
      // Second call (CreateBucket) succeeds
      mockSend.mockResolvedValueOnce({});

      const result = await provider.ensureBucket();

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should create bucket when NoSuchBucket", async () => {
      mockSend.mockRejectedValueOnce({ name: "NoSuchBucket" });
      mockSend.mockResolvedValueOnce({});

      const result = await provider.ensureBucket();

      expect(result.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should return error for other head bucket errors", async () => {
      mockSend.mockRejectedValueOnce({ name: "AccessDenied" });

      const result = await provider.ensureBucket();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ACCESS_DENIED");
      }
    });

    it("should return error when bucket creation fails", async () => {
      mockSend.mockRejectedValueOnce({ name: "NotFound" });
      mockSend.mockRejectedValueOnce(new Error("Creation failed"));

      const result = await provider.ensureBucket();

      expect(result.ok).toBe(false);
    });
  });
});
