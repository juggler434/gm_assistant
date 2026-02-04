import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@/db/schema/index.js";

// Mock state that will be set up in beforeEach
let mockDbResult: unknown[] = [];

// Mock the db module with factory functions
vi.mock("@/db/index.js", () => {
  const mockReturning = vi.fn(() => Promise.resolve(mockDbResult));
  const mockLimit = vi.fn(() => ({
    offset: vi.fn(() => Promise.resolve(mockDbResult)),
  }));
  const mockOrderBy = vi.fn(() => ({
    limit: mockLimit,
  }));

  const mockWhere = vi.fn(() => ({
    limit: vi.fn(() => Promise.resolve(mockDbResult)),
    orderBy: mockOrderBy,
    returning: mockReturning,
    where: vi.fn(() => ({
      orderBy: mockOrderBy,
    })),
    $dynamic: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: mockOrderBy,
      })),
      orderBy: mockOrderBy,
    })),
  }));

  const mockSet = vi.fn(() => ({
    where: mockWhere,
  }));

  return {
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: mockReturning,
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: mockWhere,
          orderBy: mockOrderBy,
        })),
      })),
      update: vi.fn(() => ({
        set: mockSet,
      })),
      delete: vi.fn(() => ({
        where: mockWhere,
      })),
    },
  };
});

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...conditions) => ({ type: "and", conditions })),
  desc: vi.fn((col) => ({ type: "desc", col })),
}));

// Import repository after mocks are set up
import {
  createDocument,
  findDocumentById,
  findDocumentByIdAndCampaignId,
  findDocumentsByCampaignId,
  updateDocumentStatus,
  updateDocumentChunkCount,
  deleteDocument,
} from "@/modules/documents/repository.js";

describe("Document Repository", () => {
  const mockDocument: Document = {
    id: "456e7890-e89b-12d3-a456-426614174001",
    campaignId: "123e4567-e89b-12d3-a456-426614174000",
    uploadedBy: "user-123",
    name: "test-document.pdf",
    originalFilename: "test-document.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    storagePath: "campaigns/123e4567-e89b-12d3-a456-426614174000/documents/456e7890-e89b-12d3-a456-426614174001",
    documentType: "notes",
    tags: [],
    metadata: {},
    status: "pending",
    processingError: null,
    chunkCount: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = [];
  });

  describe("createDocument", () => {
    it("should insert document and return the created record", async () => {
      mockDbResult = [mockDocument];

      const result = await createDocument({
        id: mockDocument.id,
        campaignId: mockDocument.campaignId,
        uploadedBy: mockDocument.uploadedBy,
        name: mockDocument.name,
        originalFilename: mockDocument.originalFilename,
        mimeType: mockDocument.mimeType,
        fileSize: mockDocument.fileSize,
        storagePath: mockDocument.storagePath,
        documentType: mockDocument.documentType,
        tags: [],
        status: "pending",
      });

      expect(result).toEqual(mockDocument);
    });

    it("should return null when insert returns empty array", async () => {
      mockDbResult = [];

      const result = await createDocument({
        campaignId: mockDocument.campaignId,
        uploadedBy: mockDocument.uploadedBy,
        name: mockDocument.name,
        originalFilename: mockDocument.originalFilename,
        mimeType: mockDocument.mimeType,
        fileSize: mockDocument.fileSize,
        storagePath: mockDocument.storagePath,
        documentType: mockDocument.documentType,
      });

      expect(result).toBeNull();
    });

    it("should handle document with all optional fields", async () => {
      const fullDocument = {
        ...mockDocument,
        tags: ["tag1", "tag2"],
        metadata: { author: "Test Author" },
      };
      mockDbResult = [fullDocument];

      const result = await createDocument({
        id: mockDocument.id,
        campaignId: mockDocument.campaignId,
        uploadedBy: mockDocument.uploadedBy,
        name: mockDocument.name,
        originalFilename: mockDocument.originalFilename,
        mimeType: mockDocument.mimeType,
        fileSize: mockDocument.fileSize,
        storagePath: mockDocument.storagePath,
        documentType: mockDocument.documentType,
        tags: ["tag1", "tag2"],
        metadata: { author: "Test Author" },
      });

      expect(result).toEqual(fullDocument);
      expect(result?.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("findDocumentById", () => {
    it("should return document when found", async () => {
      mockDbResult = [mockDocument];

      const result = await findDocumentById(mockDocument.id);

      expect(result).toEqual(mockDocument);
    });

    it("should return null when document not found", async () => {
      mockDbResult = [];

      const result = await findDocumentById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("findDocumentByIdAndCampaignId", () => {
    it("should return document when found with matching id and campaignId", async () => {
      mockDbResult = [mockDocument];

      const result = await findDocumentByIdAndCampaignId(
        mockDocument.id,
        mockDocument.campaignId
      );

      expect(result).toEqual(mockDocument);
    });

    it("should return null when document not found", async () => {
      mockDbResult = [];

      const result = await findDocumentByIdAndCampaignId(
        "non-existent-id",
        mockDocument.campaignId
      );

      expect(result).toBeNull();
    });

    it("should return null when document belongs to different campaign", async () => {
      mockDbResult = [];

      const result = await findDocumentByIdAndCampaignId(
        mockDocument.id,
        "different-campaign"
      );

      expect(result).toBeNull();
    });
  });

  describe("findDocumentsByCampaignId", () => {
    it("should return all documents for a campaign", async () => {
      const documents = [
        mockDocument,
        { ...mockDocument, id: "doc-2", name: "second-doc.txt" },
      ];
      mockDbResult = documents;

      const result = await findDocumentsByCampaignId(mockDocument.campaignId);

      expect(result).toEqual(documents);
    });

    it("should return empty array when campaign has no documents", async () => {
      mockDbResult = [];

      const result = await findDocumentsByCampaignId("campaign-with-no-docs");

      expect(result).toEqual([]);
    });

    it("should apply status filter when provided", async () => {
      const readyDocs = [{ ...mockDocument, status: "ready" as const }];
      mockDbResult = readyDocs;

      const result = await findDocumentsByCampaignId(mockDocument.campaignId, {
        status: "ready",
      });

      expect(result).toEqual(readyDocs);
    });

    it("should apply documentType filter when provided", async () => {
      const rulebookDocs = [{ ...mockDocument, documentType: "rulebook" as const }];
      mockDbResult = rulebookDocs;

      const result = await findDocumentsByCampaignId(mockDocument.campaignId, {
        documentType: "rulebook",
      });

      expect(result).toEqual(rulebookDocs);
    });

    it("should use default limit and offset when not provided", async () => {
      mockDbResult = [mockDocument];

      const result = await findDocumentsByCampaignId(mockDocument.campaignId);

      expect(result).toEqual([mockDocument]);
    });

    it("should apply custom limit and offset", async () => {
      mockDbResult = [mockDocument];

      const result = await findDocumentsByCampaignId(mockDocument.campaignId, {
        limit: 10,
        offset: 20,
      });

      expect(result).toEqual([mockDocument]);
    });
  });

  describe("updateDocumentStatus", () => {
    it("should update status and return updated document", async () => {
      const updatedDocument = { ...mockDocument, status: "processing" as const };
      mockDbResult = [updatedDocument];

      const result = await updateDocumentStatus(mockDocument.id, "processing");

      expect(result).toEqual(updatedDocument);
      expect(result?.status).toBe("processing");
    });

    it("should update status to ready", async () => {
      const readyDocument = { ...mockDocument, status: "ready" as const };
      mockDbResult = [readyDocument];

      const result = await updateDocumentStatus(mockDocument.id, "ready");

      expect(result).toEqual(readyDocument);
    });

    it("should update status to failed with error message", async () => {
      const failedDocument = {
        ...mockDocument,
        status: "failed" as const,
        processingError: "Failed to extract text",
      };
      mockDbResult = [failedDocument];

      const result = await updateDocumentStatus(
        mockDocument.id,
        "failed",
        "Failed to extract text"
      );

      expect(result).toEqual(failedDocument);
      expect(result?.processingError).toBe("Failed to extract text");
    });

    it("should return null when document not found", async () => {
      mockDbResult = [];

      const result = await updateDocumentStatus("non-existent-id", "ready");

      expect(result).toBeNull();
    });
  });

  describe("updateDocumentChunkCount", () => {
    it("should update chunk count and set status to ready", async () => {
      const processedDocument = {
        ...mockDocument,
        status: "ready" as const,
        chunkCount: 42,
      };
      mockDbResult = [processedDocument];

      const result = await updateDocumentChunkCount(mockDocument.id, 42);

      expect(result).toEqual(processedDocument);
      expect(result?.chunkCount).toBe(42);
      expect(result?.status).toBe("ready");
    });

    it("should handle zero chunk count", async () => {
      const processedDocument = {
        ...mockDocument,
        status: "ready" as const,
        chunkCount: 0,
      };
      mockDbResult = [processedDocument];

      const result = await updateDocumentChunkCount(mockDocument.id, 0);

      expect(result).toEqual(processedDocument);
      expect(result?.chunkCount).toBe(0);
    });

    it("should return null when document not found", async () => {
      mockDbResult = [];

      const result = await updateDocumentChunkCount("non-existent-id", 10);

      expect(result).toBeNull();
    });
  });

  describe("deleteDocument", () => {
    it("should delete document and return deleted record", async () => {
      mockDbResult = [mockDocument];

      const result = await deleteDocument(mockDocument.id, mockDocument.campaignId);

      expect(result).toEqual(mockDocument);
    });

    it("should return null when document not found", async () => {
      mockDbResult = [];

      const result = await deleteDocument("non-existent-id", mockDocument.campaignId);

      expect(result).toBeNull();
    });

    it("should return null when document belongs to different campaign", async () => {
      mockDbResult = [];

      const result = await deleteDocument(mockDocument.id, "different-campaign");

      expect(result).toBeNull();
    });
  });

  describe("Document Types", () => {
    it("should handle rulebook document type", async () => {
      const rulebookDoc = { ...mockDocument, documentType: "rulebook" as const };
      mockDbResult = [rulebookDoc];

      const result = await createDocument({
        ...mockDocument,
        documentType: "rulebook",
      });

      expect(result?.documentType).toBe("rulebook");
    });

    it("should handle setting document type", async () => {
      const settingDoc = { ...mockDocument, documentType: "setting" as const };
      mockDbResult = [settingDoc];

      const result = await createDocument({
        ...mockDocument,
        documentType: "setting",
      });

      expect(result?.documentType).toBe("setting");
    });

    it("should handle map document type", async () => {
      const mapDoc = { ...mockDocument, documentType: "map" as const };
      mockDbResult = [mapDoc];

      const result = await createDocument({
        ...mockDocument,
        documentType: "map",
      });

      expect(result?.documentType).toBe("map");
    });

    it("should handle image document type", async () => {
      const imageDoc = { ...mockDocument, documentType: "image" as const };
      mockDbResult = [imageDoc];

      const result = await createDocument({
        ...mockDocument,
        documentType: "image",
      });

      expect(result?.documentType).toBe("image");
    });
  });

  describe("Document Status Workflow", () => {
    it("should support pending -> processing -> ready workflow", async () => {
      // Start with pending
      const pendingDoc = { ...mockDocument, status: "pending" as const };
      mockDbResult = [pendingDoc];

      let result = await createDocument(mockDocument);
      expect(result?.status).toBe("pending");

      // Update to processing
      const processingDoc = { ...mockDocument, status: "processing" as const };
      mockDbResult = [processingDoc];

      result = await updateDocumentStatus(mockDocument.id, "processing");
      expect(result?.status).toBe("processing");

      // Update to ready with chunk count
      const readyDoc = {
        ...mockDocument,
        status: "ready" as const,
        chunkCount: 15,
      };
      mockDbResult = [readyDoc];

      result = await updateDocumentChunkCount(mockDocument.id, 15);
      expect(result?.status).toBe("ready");
      expect(result?.chunkCount).toBe(15);
    });

    it("should support pending -> processing -> failed workflow", async () => {
      // Start with pending
      const pendingDoc = { ...mockDocument, status: "pending" as const };
      mockDbResult = [pendingDoc];

      let result = await createDocument(mockDocument);
      expect(result?.status).toBe("pending");

      // Update to processing
      const processingDoc = { ...mockDocument, status: "processing" as const };
      mockDbResult = [processingDoc];

      result = await updateDocumentStatus(mockDocument.id, "processing");
      expect(result?.status).toBe("processing");

      // Update to failed with error
      const failedDoc = {
        ...mockDocument,
        status: "failed" as const,
        processingError: "Unsupported PDF format",
      };
      mockDbResult = [failedDoc];

      result = await updateDocumentStatus(
        mockDocument.id,
        "failed",
        "Unsupported PDF format"
      );
      expect(result?.status).toBe("failed");
      expect(result?.processingError).toBe("Unsupported PDF format");
    });
  });
});
