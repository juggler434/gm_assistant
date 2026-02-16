import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConversationRow, ConversationMessageRow } from "@/db/schema/index.js";
import type { Campaign } from "@/db/schema/index.js";

// Mock dependencies before importing routes
vi.mock("@/modules/conversations/repository.js", () => ({
  createConversation: vi.fn(),
  findConversationsByCampaignAndUser: vi.fn(),
  findConversationById: vi.fn(),
  findMessagesByConversationId: vi.fn(),
  addMessages: vi.fn(),
  touchConversation: vi.fn(),
  deleteConversation: vi.fn(),
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

vi.mock("@/services/metrics/service.js", () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  trackTimed: vi.fn(),
  isMetricsEnabled: vi.fn(() => false),
  shutdownMetrics: vi.fn(),
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
    add: vi.fn().mockResolvedValue({ ok: true, value: "job-123" }),
  })),
  DEFAULT_JOB_OPTIONS: {},
}));

// Import mocked modules
import {
  createConversation,
  findConversationsByCampaignAndUser,
  findConversationById,
  findMessagesByConversationId,
  addMessages,
  touchConversation,
  deleteConversation,
} from "@/modules/conversations/repository.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";

describe("Conversation Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";
  const mockConversationId = "223e4567-e89b-12d3-a456-426614174000";

  const mockCampaign: Campaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: "A test campaign",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConversation: ConversationRow = {
    id: mockConversationId,
    campaignId: mockCampaignId,
    userId: mockUserId,
    title: "What are the weaknesses of Strahd?",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage: ConversationMessageRow = {
    id: "msg-123",
    conversationId: mockConversationId,
    role: "user",
    content: "What are the weaknesses of Strahd?",
    sources: null,
    confidence: null,
    createdAt: new Date(),
  };

  const mockAssistantMessage: ConversationMessageRow = {
    id: "msg-456",
    conversationId: mockConversationId,
    role: "assistant",
    content: "Strahd has several weaknesses...",
    sources: [
      {
        documentName: "curse-of-strahd.pdf",
        documentId: "doc-1",
        documentType: "rulebook",
        pageNumber: 234,
        section: null,
        relevanceScore: 0.92,
      },
    ],
    confidence: "high",
    createdAt: new Date(),
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSessionToken).mockResolvedValue(mockSessionResult);
    vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(mockCampaign);
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

  // =========================================================================
  // GET /api/campaigns/:campaignId/conversations
  // =========================================================================

  describe("GET /api/campaigns/:campaignId/conversations", () => {
    it("should return 200 and list of conversations", async () => {
      const conversations = [
        mockConversation,
        {
          ...mockConversation,
          id: "conv-2",
          title: "Tell me about Ireena",
        },
      ];
      vi.mocked(findConversationsByCampaignAndUser).mockResolvedValue(conversations);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.conversations).toHaveLength(2);
      expect(body.conversations[0].title).toBe("What are the weaknesses of Strahd?");

      expect(findConversationsByCampaignAndUser).toHaveBeenCalledWith(mockCampaignId, mockUserId);

      await app.close();
    });

    it("should return empty array when no conversations exist", async () => {
      vi.mocked(findConversationsByCampaignAndUser).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.conversations).toHaveLength(0);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 400 for invalid campaign ID", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/not-a-uuid/conversations`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN_FORMAT" as const },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  // =========================================================================
  // POST /api/campaigns/:campaignId/conversations
  // =========================================================================

  describe("POST /api/campaigns/:campaignId/conversations", () => {
    it("should return 201 and created conversation", async () => {
      vi.mocked(createConversation).mockResolvedValue(mockConversation);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
        payload: { title: "What are the weaknesses of Strahd?" },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.conversation.title).toBe("What are the weaknesses of Strahd?");

      expect(createConversation).toHaveBeenCalledWith({
        campaignId: mockCampaignId,
        userId: mockUserId,
        title: "What are the weaknesses of Strahd?",
      });

      await app.close();
    });

    it("should return 400 when title is missing", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 when title is empty", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
        payload: { title: "" },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
        payload: { title: "Test" },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 500 when creation fails", async () => {
      vi.mocked(createConversation).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations`,
        headers: { cookie: getAuthCookie() },
        payload: { title: "Test" },
      });

      expect(response.statusCode).toBe(500);

      await app.close();
    });
  });

  // =========================================================================
  // GET /api/campaigns/:campaignId/conversations/:conversationId
  // =========================================================================

  describe("GET /api/campaigns/:campaignId/conversations/:conversationId", () => {
    it("should return 200 with conversation and messages", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);
      vi.mocked(findMessagesByConversationId).mockResolvedValue([
        mockMessage,
        mockAssistantMessage,
      ]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.conversation.id).toBe(mockConversationId);
      expect(body.conversation.title).toBe("What are the weaknesses of Strahd?");
      expect(body.conversation.messages).toHaveLength(2);
      expect(body.conversation.messages[0].role).toBe("user");
      expect(body.conversation.messages[1].role).toBe("assistant");
      expect(body.conversation.messages[1].sources).toHaveLength(1);
      expect(body.conversation.messages[1].confidence).toBe("high");

      expect(findConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockCampaignId,
        mockUserId
      );
      expect(findMessagesByConversationId).toHaveBeenCalledWith(mockConversationId);

      await app.close();
    });

    it("should return 200 with empty messages for new conversation", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);
      vi.mocked(findMessagesByConversationId).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.conversation.messages).toHaveLength(0);

      await app.close();
    });

    it("should return 404 when conversation not found", async () => {
      vi.mocked(findConversationById).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 400 for invalid conversation ID", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/conversations/not-a-uuid`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  // =========================================================================
  // POST /api/campaigns/:campaignId/conversations/:conversationId/messages
  // =========================================================================

  describe("POST /api/campaigns/:campaignId/conversations/:conversationId/messages", () => {
    it("should return 201 and saved messages", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);
      vi.mocked(addMessages).mockResolvedValue([mockMessage, mockAssistantMessage]);
      vi.mocked(touchConversation).mockResolvedValue(undefined);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: {
          messages: [
            {
              role: "user",
              content: "What are the weaknesses of Strahd?",
            },
            {
              role: "assistant",
              content: "Strahd has several weaknesses...",
              sources: [
                {
                  documentName: "curse-of-strahd.pdf",
                  documentId: "doc-1",
                  documentType: "rulebook",
                  pageNumber: 234,
                  section: null,
                  relevanceScore: 0.92,
                },
              ],
              confidence: "high",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.messages).toHaveLength(2);

      expect(addMessages).toHaveBeenCalledWith([
        {
          conversationId: mockConversationId,
          role: "user",
          content: "What are the weaknesses of Strahd?",
          sources: null,
          confidence: null,
        },
        {
          conversationId: mockConversationId,
          role: "assistant",
          content: "Strahd has several weaknesses...",
          sources: [
            {
              documentName: "curse-of-strahd.pdf",
              documentId: "doc-1",
              documentType: "rulebook",
              pageNumber: 234,
              section: null,
              relevanceScore: 0.92,
            },
          ],
          confidence: "high",
        },
      ]);

      expect(touchConversation).toHaveBeenCalledWith(mockConversationId);

      await app.close();
    });

    it("should return 201 for a single user message", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);
      vi.mocked(addMessages).mockResolvedValue([mockMessage]);
      vi.mocked(touchConversation).mockResolvedValue(undefined);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: {
          messages: [
            {
              role: "user",
              content: "Tell me about Ireena",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);

      await app.close();
    });

    it("should return 400 when messages array is empty", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: { messages: [] },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 when message content is empty", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: {
          messages: [{ role: "user", content: "" }],
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 when role is invalid", async () => {
      vi.mocked(findConversationById).mockResolvedValue(mockConversation);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: {
          messages: [{ role: "system", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 404 when conversation not found", async () => {
      vi.mocked(findConversationById).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}/messages`,
        headers: { cookie: getAuthCookie() },
        payload: {
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  // =========================================================================
  // DELETE /api/campaigns/:campaignId/conversations/:conversationId
  // =========================================================================

  describe("DELETE /api/campaigns/:campaignId/conversations/:conversationId", () => {
    it("should return 204 on successful deletion", async () => {
      vi.mocked(deleteConversation).mockResolvedValue(mockConversation);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(204);

      expect(deleteConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockCampaignId,
        mockUserId
      );

      await app.close();
    });

    it("should return 404 when conversation not found", async () => {
      vi.mocked(deleteConversation).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/conversations/${mockConversationId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 400 for invalid conversation ID", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/conversations/not-a-uuid`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });
});
