import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Campaign } from "@/db/schema/index.js";

// Mock dependencies before importing routes
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
  createCampaign,
  findCampaignsByUserId,
  findCampaignByIdAndUserId,
  updateCampaign,
  deleteCampaign,
} from "@/modules/campaigns/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";

describe("Campaign Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";

  const mockCampaign: Campaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: "A test campaign description",
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

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to authenticated user
    vi.mocked(validateSessionToken).mockResolvedValue(mockSessionResult);
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

  describe("POST /api/campaigns", () => {
    it("should return 201 and campaign on successful creation", async () => {
      vi.mocked(createCampaign).mockResolvedValue(mockCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Test Campaign",
          description: "A test campaign description",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.campaign.name).toBe("Test Campaign");
      expect(body.campaign.description).toBe("A test campaign description");

      expect(createCampaign).toHaveBeenCalledWith({
        userId: mockUserId,
        name: "Test Campaign",
        description: "A test campaign description",
      });

      await app.close();
    });

    it("should accept campaign without description", async () => {
      const campaignWithoutDesc = { ...mockCampaign, description: null };
      vi.mocked(createCampaign).mockResolvedValue(campaignWithoutDesc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Test Campaign",
        },
      });

      expect(response.statusCode).toBe(201);

      expect(createCampaign).toHaveBeenCalledWith({
        userId: mockUserId,
        name: "Test Campaign",
        description: null,
      });

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "Test Campaign",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(createCampaign).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 400 for missing name", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
        payload: {
          description: "Only description",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

      await app.close();
    });

    it("should return 400 for empty name", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "",
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 500 when campaign creation fails", async () => {
      vi.mocked(createCampaign).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Test Campaign",
        },
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to create campaign");

      await app.close();
    });
  });

  describe("GET /api/campaigns", () => {
    it("should return 200 and list of user campaigns", async () => {
      const campaigns = [
        mockCampaign,
        { ...mockCampaign, id: "campaign-2", name: "Second Campaign" },
      ];
      vi.mocked(findCampaignsByUserId).mockResolvedValue(campaigns);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.campaigns).toHaveLength(2);

      expect(findCampaignsByUserId).toHaveBeenCalledWith(mockUserId);

      await app.close();
    });

    it("should return empty array when user has no campaigns", async () => {
      vi.mocked(findCampaignsByUserId).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.campaigns).toEqual([]);

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
        url: "/api/campaigns",
      });

      expect(response.statusCode).toBe(401);
      expect(findCampaignsByUserId).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe("GET /api/campaigns/:id", () => {
    it("should return 200 and campaign details", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(mockCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.campaign.id).toBe(mockCampaignId);
      expect(body.campaign.name).toBe("Test Campaign");

      expect(findCampaignByIdAndUserId).toHaveBeenCalledWith(
        mockCampaignId,
        mockUserId
      );

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns/not-a-uuid",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

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
        url: `/api/campaigns/${mockCampaignId}`,
      });

      expect(response.statusCode).toBe(401);
      expect(findCampaignByIdAndUserId).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe("PATCH /api/campaigns/:id", () => {
    it("should return 200 and updated campaign", async () => {
      const updatedCampaign = { ...mockCampaign, name: "Updated Campaign" };
      vi.mocked(updateCampaign).mockResolvedValue(updatedCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Updated Campaign",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.campaign.name).toBe("Updated Campaign");

      expect(updateCampaign).toHaveBeenCalledWith(mockCampaignId, mockUserId, {
        name: "Updated Campaign",
      });

      await app.close();
    });

    it("should update description only", async () => {
      const updatedCampaign = {
        ...mockCampaign,
        description: "New description",
      };
      vi.mocked(updateCampaign).mockResolvedValue(updatedCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {
          description: "New description",
        },
      });

      expect(response.statusCode).toBe(200);

      expect(updateCampaign).toHaveBeenCalledWith(mockCampaignId, mockUserId, {
        description: "New description",
      });

      await app.close();
    });

    it("should clear description by setting null", async () => {
      const updatedCampaign = { ...mockCampaign, description: null };
      vi.mocked(updateCampaign).mockResolvedValue(updatedCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {
          description: null,
        },
      });

      expect(response.statusCode).toBe(200);

      expect(updateCampaign).toHaveBeenCalledWith(mockCampaignId, mockUserId, {
        description: null,
      });

      await app.close();
    });

    it("should return 400 when no fields to update", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("No fields to update");

      expect(updateCampaign).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(updateCampaign).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Updated Campaign",
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: "/api/campaigns/not-a-uuid",
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Updated Campaign",
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 for empty name", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "",
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}`,
        payload: {
          name: "Updated Campaign",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(updateCampaign).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe("DELETE /api/campaigns/:id", () => {
    it("should return 204 on successful deletion", async () => {
      vi.mocked(deleteCampaign).mockResolvedValue(mockCampaign);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");

      expect(deleteCampaign).toHaveBeenCalledWith(mockCampaignId, mockUserId);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(deleteCampaign).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: "/api/campaigns/not-a-uuid",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

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
        url: `/api/campaigns/${mockCampaignId}`,
      });

      expect(response.statusCode).toBe(401);
      expect(deleteCampaign).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe("User Isolation", () => {
    it("should only allow access to own campaigns", async () => {
      // Simulate campaign belonging to different user
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      // Verify it's using the user's ID from session
      expect(findCampaignByIdAndUserId).toHaveBeenCalledWith(
        mockCampaignId,
        mockUserId
      );

      await app.close();
    });
  });
});
