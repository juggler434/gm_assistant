import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Campaign } from "@/db/schema/campaigns.js";
import type { Document } from "@/db/schema/documents.js";
import FormData from "form-data";

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
  })),
}));

vi.mock("@/jobs/factory.js", () => ({
  createQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ ok: true, value: "job-123" }),
  })),
  DEFAULT_JOB_OPTIONS: {},
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
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
