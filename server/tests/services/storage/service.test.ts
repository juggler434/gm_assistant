import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StorageService,
  type StorageLogger,
} from "../../../src/services/storage/service.js";
import type { StorageProvider } from "../../../src/services/storage/providers/interface.js";
import type {
  UploadResponse,
  DownloadResponse,
  SignedUrlResponse,
  ListResponse,
} from "../../../src/services/storage/types.js";
import { StorageError } from "../../../src/services/storage/errors.js";
import { ok, err } from "../../../src/types/index.js";

function createMockProvider(): StorageProvider {
  return {
    name: "mock",
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
    getSignedUrl: vi.fn(),
    exists: vi.fn(),
    list: vi.fn(),
    healthCheck: vi.fn(),
    ensureBucket: vi.fn(),
  };
}

function createMockLogger(): StorageLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("StorageService", () => {
  let service: StorageService;
  let mockProvider: StorageProvider;
  let mockLogger: StorageLogger;

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockLogger = createMockLogger();
    service = new StorageService(mockProvider, { logger: mockLogger });
  });

  describe("properties", () => {
    it("should return provider name", () => {
      expect(service.providerName).toBe("mock");
    });
  });

  describe("upload", () => {
    it("should upload file with correct path", async () => {
      const mockResponse: UploadResponse = {
        key: "campaigns/camp-123/documents/doc-456",
        bucket: "test-bucket",
        etag: "abc123",
      };
      vi.mocked(mockProvider.upload).mockResolvedValueOnce(ok(mockResponse));

      const content = Buffer.from("test content");
      const result = await service.upload("camp-123", "doc-456", content, {
        contentType: "text/plain",
      });

      expect(mockProvider.upload).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
        content,
        metadata: { contentType: "text/plain" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe("campaigns/camp-123/documents/doc-456");
      }
    });

    it("should upload without metadata", async () => {
      const mockResponse: UploadResponse = {
        key: "campaigns/camp-123/documents/doc-456",
        bucket: "test-bucket",
      };
      vi.mocked(mockProvider.upload).mockResolvedValueOnce(ok(mockResponse));

      const content = Buffer.from("test content");
      await service.upload("camp-123", "doc-456", content);

      expect(mockProvider.upload).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
        content,
      });
    });

    it("should log on success", async () => {
      const mockResponse: UploadResponse = {
        key: "campaigns/camp-123/documents/doc-456",
        bucket: "test-bucket",
      };
      vi.mocked(mockProvider.upload).mockResolvedValueOnce(ok(mockResponse));

      await service.upload("camp-123", "doc-456", Buffer.from("test"));

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Upload completed",
        expect.objectContaining({ key: "campaigns/camp-123/documents/doc-456" })
      );
    });

    it("should log on error", async () => {
      const error = StorageError.uploadFailed("test-key");
      vi.mocked(mockProvider.upload).mockResolvedValueOnce(err(error));

      await service.upload("camp-123", "doc-456", Buffer.from("test"));

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Upload failed",
        expect.objectContaining({
          campaignId: "camp-123",
          documentId: "doc-456",
          code: "UPLOAD_FAILED",
        })
      );
    });
  });

  describe("download", () => {
    it("should download file by campaign and document IDs", async () => {
      const mockResponse: DownloadResponse = {
        content: Buffer.from("file content"),
        contentType: "text/plain",
        contentLength: 12,
      };
      vi.mocked(mockProvider.download).mockResolvedValueOnce(ok(mockResponse));

      const result = await service.download("camp-123", "doc-456");

      expect(mockProvider.download).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content.toString()).toBe("file content");
      }
    });

    it("should download file by key", async () => {
      const mockResponse: DownloadResponse = {
        content: Buffer.from("file content"),
      };
      vi.mocked(mockProvider.download).mockResolvedValueOnce(ok(mockResponse));

      await service.downloadByKey("custom/path/file.txt");

      expect(mockProvider.download).toHaveBeenCalledWith({
        key: "custom/path/file.txt",
      });
    });

    it("should return error when file not found", async () => {
      const error = StorageError.notFound("campaigns/camp-123/documents/doc-456");
      vi.mocked(mockProvider.download).mockResolvedValueOnce(err(error));

      const result = await service.download("camp-123", "doc-456");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("delete", () => {
    it("should delete file by campaign and document IDs", async () => {
      vi.mocked(mockProvider.delete).mockResolvedValueOnce(ok(undefined));

      const result = await service.delete("camp-123", "doc-456");

      expect(mockProvider.delete).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
      });
      expect(result.ok).toBe(true);
    });

    it("should delete file by key", async () => {
      vi.mocked(mockProvider.delete).mockResolvedValueOnce(ok(undefined));

      await service.deleteByKey("custom/path/file.txt");

      expect(mockProvider.delete).toHaveBeenCalledWith({
        key: "custom/path/file.txt",
      });
    });

    it("should log on success", async () => {
      vi.mocked(mockProvider.delete).mockResolvedValueOnce(ok(undefined));

      await service.delete("camp-123", "doc-456");

      expect(mockLogger.info).toHaveBeenCalledWith("Delete completed", {
        campaignId: "camp-123",
        documentId: "doc-456",
      });
    });
  });

  describe("getSignedUrl", () => {
    it("should generate signed URL with default expiration", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      const mockResponse: SignedUrlResponse = {
        url: "https://storage.example.com/file?signature=xxx",
        expiresAt,
      };
      vi.mocked(mockProvider.getSignedUrl).mockResolvedValueOnce(ok(mockResponse));

      const result = await service.getSignedUrl("camp-123", "doc-456");

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toContain("https://");
      }
    });

    it("should generate signed URL with custom expiration", async () => {
      const expiresAt = new Date(Date.now() + 7200 * 1000);
      const mockResponse: SignedUrlResponse = {
        url: "https://storage.example.com/file?signature=xxx",
        expiresAt,
      };
      vi.mocked(mockProvider.getSignedUrl).mockResolvedValueOnce(ok(mockResponse));

      await service.getSignedUrl("camp-123", "doc-456", 7200);

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
        expiresIn: 7200,
      });
    });

    it("should generate signed URL by key", async () => {
      const mockResponse: SignedUrlResponse = {
        url: "https://storage.example.com/file?signature=xxx",
        expiresAt: new Date(),
      };
      vi.mocked(mockProvider.getSignedUrl).mockResolvedValueOnce(ok(mockResponse));

      await service.getSignedUrlByKey("custom/path/file.txt", 1800);

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith({
        key: "custom/path/file.txt",
        expiresIn: 1800,
      });
    });
  });

  describe("exists", () => {
    it("should check if file exists", async () => {
      vi.mocked(mockProvider.exists).mockResolvedValueOnce(ok(true));

      const result = await service.exists("camp-123", "doc-456");

      expect(mockProvider.exists).toHaveBeenCalledWith({
        campaignId: "camp-123",
        documentId: "doc-456",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return false for non-existent file", async () => {
      vi.mocked(mockProvider.exists).mockResolvedValueOnce(ok(false));

      const result = await service.exists("camp-123", "doc-456");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should check existence by key", async () => {
      vi.mocked(mockProvider.exists).mockResolvedValueOnce(ok(true));

      await service.existsByKey("custom/path/file.txt");

      expect(mockProvider.exists).toHaveBeenCalledWith({
        key: "custom/path/file.txt",
      });
    });
  });

  describe("list", () => {
    it("should list campaign documents", async () => {
      const mockResponse: ListResponse = {
        files: [
          { key: "campaigns/camp-123/documents/doc-1", size: 100 },
          { key: "campaigns/camp-123/documents/doc-2", size: 200 },
        ],
        isTruncated: false,
      };
      vi.mocked(mockProvider.list).mockResolvedValueOnce(ok(mockResponse));

      const result = await service.listCampaignDocuments("camp-123");

      expect(mockProvider.list).toHaveBeenCalledWith({
        campaignId: "camp-123",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files).toHaveLength(2);
      }
    });

    it("should list with pagination options", async () => {
      const mockResponse: ListResponse = {
        files: [{ key: "test", size: 100 }],
        isTruncated: true,
        continuationToken: "next-token",
      };
      vi.mocked(mockProvider.list).mockResolvedValueOnce(ok(mockResponse));

      await service.listCampaignDocuments("camp-123", {
        maxKeys: 10,
        continuationToken: "prev-token",
      });

      expect(mockProvider.list).toHaveBeenCalledWith({
        campaignId: "camp-123",
        maxKeys: 10,
        continuationToken: "prev-token",
      });
    });

    it("should list with custom options", async () => {
      const mockResponse: ListResponse = {
        files: [],
        isTruncated: false,
      };
      vi.mocked(mockProvider.list).mockResolvedValueOnce(ok(mockResponse));

      await service.list({ prefix: "custom/prefix/" });

      expect(mockProvider.list).toHaveBeenCalledWith({
        prefix: "custom/prefix/",
      });
    });
  });

  describe("healthCheck", () => {
    it("should delegate to provider", async () => {
      vi.mocked(mockProvider.healthCheck).mockResolvedValueOnce(true);

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockProvider.healthCheck).toHaveBeenCalled();
    });

    it("should return false when unhealthy", async () => {
      vi.mocked(mockProvider.healthCheck).mockResolvedValueOnce(false);

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("ensureBucket", () => {
    it("should create bucket if it does not exist", async () => {
      vi.mocked(mockProvider.ensureBucket).mockResolvedValueOnce(ok(undefined));

      const result = await service.ensureBucket();

      expect(mockProvider.ensureBucket).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it("should log bucket creation", async () => {
      vi.mocked(mockProvider.ensureBucket).mockResolvedValueOnce(ok(undefined));

      await service.ensureBucket();

      expect(mockLogger.info).toHaveBeenCalledWith("Ensuring bucket exists");
    });
  });
});
