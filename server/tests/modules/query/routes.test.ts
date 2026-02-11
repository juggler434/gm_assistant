import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Campaign } from "@/db/schema/index.js";
import type { RAGResult } from "@/modules/query/rag/types.js";

// Mock dependencies before importing anything that uses them
vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
}));

vi.mock("@/modules/campaigns/repository.js", () => ({
  createCampaign: vi.fn(),
  findCampaignsByUserId: vi.fn(),
  findCampaignByIdAndUserId: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}));

vi.mock("@/modules/query/repository.js", () => ({
  findDocumentIdsByTags: vi.fn(),
}));

vi.mock("@/modules/query/rag/service.js", () => ({
  executeRAGPipeline: vi.fn(),
}));

vi.mock("@/services/llm/factory.js", () => ({
  createLLMService: vi.fn(() => ({})),
  createLLMServiceWithConfig: vi.fn(() => ({})),
}));

vi.mock("@/services/metrics/service.js", () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  isMetricsEnabled: vi.fn(() => false),
  shutdownMetrics: vi.fn(),
}));

import { validateSessionToken } from "@/modules/auth/session.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/repository.js";
import { findDocumentIdsByTags } from "@/modules/query/repository.js";
import { executeRAGPipeline } from "@/modules/query/rag/service.js";
import { trackEvent } from "@/services/metrics/service.js";

describe("Query Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";
  const mockDocId1 = "aaa14567-e89b-12d3-a456-426614174001";
  const mockDocId2 = "bbb24567-e89b-12d3-a456-426614174002";

  const mockCampaign: Campaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: "A test campaign",
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

  const mockRAGResult: RAGResult = {
    answer: "The Golden Griffin is a high-end tavern in the merchant district.",
    confidence: 0.85,
    sources: [
      {
        documentName: "World Guide",
        documentId: mockDocId1,
        documentType: "setting",
        pageNumber: 42,
        section: "Taverns",
        relevanceScore: 0.9,
      },
    ],
    isUnanswerable: false,
    chunksRetrieved: 5,
    chunksUsed: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSessionToken).mockResolvedValue(mockSessionResult);
    vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(mockCampaign);
    vi.mocked(executeRAGPipeline).mockResolvedValue({
      ok: true,
      value: mockRAGResult,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildTestApp() {
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  function getAuthCookie() {
    return "session_token=valid-token.secret";
  }

  describe("POST /api/campaigns/:campaignId/query", () => {
    it("should return 200 with answer, sources, and confidence", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.answer).toBe(mockRAGResult.answer);
      expect(body.sources).toEqual(mockRAGResult.sources);
      expect(body.confidence).toBe("high");

      await app.close();
    });

    it("should call executeRAGPipeline with correct parameters", async () => {
      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(executeRAGPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          question: "What is a high-end tavern?",
          campaignId: mockCampaignId,
        }),
        expect.anything(),
      );

      await app.close();
    });

    it("should pass documentTypes filter to RAG pipeline", async () => {
      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: { documentTypes: ["setting"] },
        },
      });

      expect(executeRAGPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          documentTypes: ["setting"],
        }),
        expect.anything(),
      );

      await app.close();
    });

    it("should pass documentIds filter to RAG pipeline", async () => {
      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: { documentIds: [mockDocId1] },
        },
      });

      expect(executeRAGPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          documentIds: [mockDocId1],
        }),
        expect.anything(),
      );

      await app.close();
    });

    // Confidence mapping tests

    it("should return confidence 'high' for score >= 0.7", async () => {
      vi.mocked(executeRAGPipeline).mockResolvedValue({
        ok: true,
        value: { ...mockRAGResult, confidence: 0.7 },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      const body = JSON.parse(response.body);
      expect(body.confidence).toBe("high");

      await app.close();
    });

    it("should return confidence 'medium' for score >= 0.4 and < 0.7", async () => {
      vi.mocked(executeRAGPipeline).mockResolvedValue({
        ok: true,
        value: { ...mockRAGResult, confidence: 0.5 },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      const body = JSON.parse(response.body);
      expect(body.confidence).toBe("medium");

      await app.close();
    });

    it("should return confidence 'low' for score < 0.4", async () => {
      vi.mocked(executeRAGPipeline).mockResolvedValue({
        ok: true,
        value: { ...mockRAGResult, confidence: 0.2 },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      const body = JSON.parse(response.body);
      expect(body.confidence).toBe("low");

      await app.close();
    });

    // Tag resolution tests

    it("should resolve tags to document IDs via findDocumentIdsByTags", async () => {
      vi.mocked(findDocumentIdsByTags).mockResolvedValue([mockDocId1, mockDocId2]);

      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: { tags: ["locations"] },
        },
      });

      expect(findDocumentIdsByTags).toHaveBeenCalledWith(
        mockCampaignId,
        ["locations"],
      );
      expect(executeRAGPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          documentIds: [mockDocId1, mockDocId2],
        }),
        expect.anything(),
      );

      await app.close();
    });

    it("should intersect tag doc IDs with explicit documentIds", async () => {
      // Tags resolve to [doc1, doc2], but explicit filter only includes doc1
      vi.mocked(findDocumentIdsByTags).mockResolvedValue([mockDocId1, mockDocId2]);

      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: {
            tags: ["locations"],
            documentIds: [mockDocId1],
          },
        },
      });

      expect(executeRAGPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          documentIds: [mockDocId1],
        }),
        expect.anything(),
      );

      await app.close();
    });

    it("should return empty answer when no documents match tags", async () => {
      vi.mocked(findDocumentIdsByTags).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: { tags: ["nonexistent-tag"] },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.sources).toEqual([]);
      expect(body.confidence).toBe("low");
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return empty answer when tag+documentId intersection is empty", async () => {
      // Tags resolve to doc2, but explicit filter has doc1 — no overlap
      vi.mocked(findDocumentIdsByTags).mockResolvedValue([mockDocId2]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {
          query: "What is a high-end tavern?",
          filters: {
            tags: ["locations"],
            documentIds: [mockDocId1],
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.sources).toEqual([]);
      expect(body.confidence).toBe("low");
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    // Metrics tracking

    it("should track campaign_queried event", async () => {
      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(trackEvent).toHaveBeenCalledWith(
        mockUserId,
        "campaign_queried",
        expect.objectContaining({
          campaign_id: mockCampaignId,
          confidence: "high",
        }),
      );

      await app.close();
    });

    // Error handling

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        payload: { query: "What is a high-end tavern?" },
      });

      expect(response.statusCode).toBe(401);
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns/not-a-uuid/query",
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 400 for missing query in body", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 400 for empty query string", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "" },
      });

      expect(response.statusCode).toBe(400);
      expect(executeRAGPipeline).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 500 when RAG pipeline fails", async () => {
      vi.mocked(executeRAGPipeline).mockResolvedValue({
        ok: false,
        error: {
          code: "GENERATION_FAILED",
          message: "LLM request timed out",
        },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/query`,
        headers: { cookie: getAuthCookie() },
        payload: { query: "What is a high-end tavern?" },
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to process query");

      await app.close();
    });
  });
});
