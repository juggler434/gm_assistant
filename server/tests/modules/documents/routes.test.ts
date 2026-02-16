import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Campaign } from "@/db/schema/campaigns.js";
import type { Document } from "@/db/schema/documents.js";
import FormData from "form-data";

// Capture queue add mock at module scope so vi.mock factory can close over it
const mockQueueAdd = vi.fn();

// Mock dependencies before importing routes
vi.mock("@/modules/documents/repository.js", () => ({
  createDocument: vi.fn(),
  findDocumentsByCampaignId: vi.fn(),
  findDocumentByIdAndCampaignId: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock("@/modules/campaigns/repository.js", () => ({
  createCampaign: vi.fn(),
  findCampaignsByUserId: vi.fn(),
  findCampaignByIdAndUserId: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
}));

vi.mock("@/services/storage/factory.js", () => ({
  createStorageService: vi.fn(() => ({
    upload: vi.fn(),
    delete: vi.fn(),
    getSignedUrl: vi.fn(),
    ensureBucket: vi.fn(),
  })),
}));

vi.mock("@/jobs/factory.js", () => ({
  createQueue: vi.fn(() => ({
    add: mockQueueAdd,
  })),
  DEFAULT_JOB_OPTIONS: {},
}));

vi.mock("@/services/metrics/service.js", () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  trackTimed: vi.fn(),
  isMetricsEnabled: vi.fn(() => false),
  shutdownMetrics: vi.fn(),
}));

// Import mocked modules
import {
  createDocument,
  findDocumentsByCampaignId,
  findDocumentByIdAndCampaignId,
  deleteDocument,
} from "@/modules/documents/repository.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";
import { createStorageService } from "@/services/storage/factory.js";

describe("Document Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";
  const mockDocumentId = "456e7890-e89b-12d3-a456-426614174001";

  const mockCampaign: Campaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: "A test campaign description",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDocument: Document = {
    id: mockDocumentId,
    campaignId: mockCampaignId,
    uploadedBy: mockUserId,
    name: "test-document.pdf",
    originalFilename: "test-document.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    storagePath: `campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
    documentType: "notes",
    tags: [],
    metadata: {},
    status: "pending",
    processingError: null,
    chunkCount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSessionResult = {
    ok: true as const,
    value: {
      userId: mockUserId,
      sessionId: "session-123",
      createdAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  };

  let mockStorageService: {
    upload: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
    ensureBucket: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default queue mock
    mockQueueAdd.mockResolvedValue({ ok: true, value: "job-123" });

    // Default to authenticated user
    vi.mocked(validateSessionToken).mockResolvedValue(mockSessionResult);

    // Default campaign found
    vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(mockCampaign);

    // Setup storage service mock
    mockStorageService = {
      upload: vi.fn().mockResolvedValue({
        ok: true,
        value: { key: `campaigns/${mockCampaignId}/documents/${mockDocumentId}` },
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      getSignedUrl: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          url: "https://storage.example.com/signed-url",
          expiresAt: new Date(Date.now() + 3600000),
        },
      }),
      ensureBucket: vi.fn().mockResolvedValue({ ok: true }),
    };
    vi.mocked(createStorageService).mockReturnValue(
      mockStorageService as unknown as ReturnType<typeof createStorageService>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildTestApp() {
    // Clear module cache to apply new mocks
    vi.resetModules();
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  function getAuthCookie() {
    return "session_token=valid-token.secret";
  }

  describe("POST /api/campaigns/:campaignId/documents", () => {
    it("should return 201 and document on successful upload", async () => {
      vi.mocked(createDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test-document.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.document.name).toBe("test-document.pdf");
      expect(body.document.mimeType).toBe("application/pdf");

      await app.close();
    });

    it("should return 400 for unsupported file type", async () => {
      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.exe",
        contentType: "application/x-executable",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.message).toContain("Unsupported file type");

      await app.close();
    });

    it("should return 400 when no file uploaded", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "multipart/form-data; boundary=----formdata",
        },
        payload: "------formdata--",
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("No file uploaded");

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns/not-a-uuid/documents",
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should accept upload with metadata fields (name, documentType, tags)", async () => {
      vi.mocked(createDocument).mockResolvedValue({
        ...mockDocument,
        name: "My Custom Name",
        documentType: "rulebook",
        tags: ["fantasy", "dnd"],
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test-document.pdf",
        contentType: "application/pdf",
      });
      form.append("name", "My Custom Name");
      form.append("documentType", "rulebook");
      form.append("tags", JSON.stringify(["fantasy", "dnd"]));

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Custom Name",
          documentType: "rulebook",
          tags: ["fantasy", "dnd"],
        })
      );

      await app.close();
    });

    it("should accept comma-separated tags string", async () => {
      vi.mocked(createDocument).mockResolvedValue({
        ...mockDocument,
        tags: ["fantasy", "campaign", "dragons"],
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });
      form.append("tags", "fantasy, campaign, dragons");

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ["fantasy", "campaign", "dragons"],
        })
      );

      await app.close();
    });

    it("should call storage.upload with correct params", async () => {
      vi.mocked(createDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "my-file.pdf",
        contentType: "application/pdf",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        mockCampaignId,
        expect.any(String), // documentId (UUID)
        expect.any(Buffer),
        {
          contentType: "application/pdf",
          metadata: { originalFilename: "my-file.pdf" },
        }
      );

      await app.close();
    });

    it("should queue document processing job with correct data", async () => {
      vi.mocked(createDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(mockQueueAdd).toHaveBeenCalledWith("process-document", {
        documentId: expect.any(String),
        campaignId: mockCampaignId,
        storagePath: expect.stringContaining(`campaigns/${mockCampaignId}/documents/`),
        mimeType: "application/pdf",
      });

      await app.close();
    });

    it("should call createDocument with all correct fields", async () => {
      vi.mocked(createDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const fileContent = Buffer.from("test content for size");
      const form = new FormData();
      form.append("file", fileContent, {
        filename: "original-file.pdf",
        contentType: "application/pdf",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(vi.mocked(createDocument)).toHaveBeenCalledWith({
        id: expect.any(String),
        campaignId: mockCampaignId,
        uploadedBy: mockUserId,
        name: "original-file.pdf", // defaults to filename when no name field
        originalFilename: "original-file.pdf",
        mimeType: "application/pdf",
        fileSize: fileContent.length,
        storagePath: expect.stringMatching(
          new RegExp(`^campaigns/${mockCampaignId}/documents/[0-9a-f-]+$`)
        ),
        documentType: "notes", // default for PDFs
        tags: [],
        status: "pending",
      });

      await app.close();
    });

    it("should return 500 when storage upload fails", async () => {
      mockStorageService.upload.mockResolvedValue({
        ok: false,
        error: { code: "STORAGE_ERROR", message: "Upload failed" },
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to upload file");
      expect(vi.mocked(createDocument)).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 500 and clean up storage when document creation fails", async () => {
      vi.mocked(createDocument).mockResolvedValue(null as unknown as ReturnType<typeof createDocument> extends Promise<infer T> ? T : never);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to create document record");
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        mockCampaignId,
        expect.any(String)
      );

      await app.close();
    });

    it("should accept text/plain file uploads", async () => {
      vi.mocked(createDocument).mockResolvedValue({
        ...mockDocument,
        mimeType: "text/plain",
        name: "notes.txt",
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("plain text content"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/plain" })
      );

      await app.close();
    });

    it("should accept text/markdown file uploads", async () => {
      vi.mocked(createDocument).mockResolvedValue({
        ...mockDocument,
        mimeType: "text/markdown",
        name: "readme.md",
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("# Markdown content"), {
        filename: "readme.md",
        contentType: "text/markdown",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/markdown" })
      );

      await app.close();
    });

    it("should infer 'image' document type for image MIME types", async () => {
      vi.mocked(createDocument).mockResolvedValue({
        ...mockDocument,
        mimeType: "image/png",
        documentType: "image",
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("fake png data"), {
        filename: "map.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({ documentType: "image" })
      );

      await app.close();
    });

    it("should default document name to filename when name field not provided", async () => {
      vi.mocked(createDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("test content"), {
        filename: "my-campaign-notes.pdf",
        contentType: "application/pdf",
      });
      // no "name" field in form

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(vi.mocked(createDocument)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "my-campaign-notes.pdf",
          originalFilename: "my-campaign-notes.pdf",
        })
      );

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/documents", () => {
    it("should return 200 and list of documents", async () => {
      const documents = [
        mockDocument,
        { ...mockDocument, id: "doc-2", name: "second-doc.txt" },
      ];
      vi.mocked(findDocumentsByCampaignId).mockResolvedValue(documents);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.documents).toHaveLength(2);

      await app.close();
    });

    it("should return empty array when no documents", async () => {
      vi.mocked(findDocumentsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.documents).toEqual([]);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should pass status filter to repository", async () => {
      vi.mocked(findDocumentsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents?status=ready`,
        headers: { cookie: getAuthCookie() },
      });

      expect(vi.mocked(findDocumentsByCampaignId)).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({ status: "ready" })
      );

      await app.close();
    });

    it("should pass documentType filter to repository", async () => {
      vi.mocked(findDocumentsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents?documentType=rulebook`,
        headers: { cookie: getAuthCookie() },
      });

      expect(vi.mocked(findDocumentsByCampaignId)).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({ documentType: "rulebook" })
      );

      await app.close();
    });

    it("should pass limit and offset to repository", async () => {
      vi.mocked(findDocumentsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents?limit=10&offset=20`,
        headers: { cookie: getAuthCookie() },
      });

      expect(vi.mocked(findDocumentsByCampaignId)).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({ limit: 10, offset: 20 })
      );

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/documents/:id", () => {
    it("should return 200 and document details", async () => {
      vi.mocked(findDocumentByIdAndCampaignId).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.document.id).toBe(mockDocumentId);

      await app.close();
    });

    it("should return 404 when document not found", async () => {
      vi.mocked(findDocumentByIdAndCampaignId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Document not found");

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/documents/:id/download", () => {
    it("should return 200 and signed URL", async () => {
      vi.mocked(findDocumentByIdAndCampaignId).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}/download`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.url).toBeDefined();
      expect(body.expiresAt).toBeDefined();

      await app.close();
    });

    it("should return 404 when document not found", async () => {
      vi.mocked(findDocumentByIdAndCampaignId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}/download`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 500 when signed URL generation fails", async () => {
      vi.mocked(findDocumentByIdAndCampaignId).mockResolvedValue(mockDocument);
      mockStorageService.getSignedUrl.mockResolvedValue({
        ok: false,
        error: { code: "STORAGE_ERROR", message: "URL generation failed" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}/download`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to generate download URL");

      await app.close();
    });
  });

  describe("DELETE /api/campaigns/:campaignId/documents/:id", () => {
    it("should return 204 on successful deletion", async () => {
      vi.mocked(deleteDocument).mockResolvedValue(mockDocument);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");

      await app.close();
    });

    it("should return 404 when document not found", async () => {
      vi.mocked(deleteDocument).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/documents/${mockDocumentId}`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });
});
