// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Npc } from "@/db/schema/index.js";

// Mock dependencies before importing routes
vi.mock("@/modules/npcs/repository.js", () => ({
  createNpc: vi.fn(),
  findNpcsByCampaignId: vi.fn(),
  findNpcByIdAndCampaignId: vi.fn(),
  updateNpc: vi.fn(),
  deleteNpc: vi.fn(),
}));

vi.mock("@/modules/campaigns/repository.js", () => ({
  createCampaign: vi.fn(),
  findCampaignsByUserId: vi.fn(),
  findCampaignById: vi.fn(),
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

import {
  createNpc,
  findNpcsByCampaignId,
  findNpcByIdAndCampaignId,
  updateNpc,
  deleteNpc,
} from "@/modules/npcs/repository.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";

describe("NPC Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";
  const mockNpcId = "223e4567-e89b-12d3-a456-426614174001";

  const mockCampaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNpc: Npc = {
    id: mockNpcId,
    campaignId: mockCampaignId,
    createdBy: mockUserId,
    name: "Grog the Brave",
    race: "Half-Orc",
    classRole: "Barbarian",
    level: "Level 5",
    appearance: "Tall and muscular with green skin",
    personality: "Loyal but hot-tempered",
    motivations: "Seeks redemption for past crimes",
    secrets: "Was once a bandit leader",
    backstory: "Raised in the wilds by wolves",
    statBlock: null,
    importance: "major",
    status: "alive",
    tags: ["fighter", "ally"],
    isGenerated: false,
    notes: null,
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

  describe("POST /api/campaigns/:campaignId/npcs", () => {
    it("should return 201 and NPC on successful creation", async () => {
      vi.mocked(createNpc).mockResolvedValue(mockNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: {
          name: "Grog the Brave",
          race: "Half-Orc",
          classRole: "Barbarian",
          importance: "major",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.npc.name).toBe("Grog the Brave");
      expect(body.npc.race).toBe("Half-Orc");

      expect(createNpc).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: mockCampaignId,
          createdBy: mockUserId,
          name: "Grog the Brave",
          race: "Half-Orc",
          classRole: "Barbarian",
          importance: "major",
        })
      );

      await app.close();
    });

    it("should accept NPC with only name", async () => {
      const minimalNpc = { ...mockNpc, race: null, classRole: null };
      vi.mocked(createNpc).mockResolvedValue(minimalNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "Grog the Brave" },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it("should return 400 for missing name", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: { race: "Elf" },
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
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "" },
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
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        payload: { name: "Test NPC" },
      });

      expect(response.statusCode).toBe(401);
      expect(createNpc).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "Test NPC" },
      });

      expect(response.statusCode).toBe(404);
      expect(createNpc).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 500 when NPC creation fails", async () => {
      vi.mocked(createNpc).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "Test NPC" },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to create NPC");
      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/npcs", () => {
    it("should return 200 and list of NPCs", async () => {
      const npcs = [mockNpc, { ...mockNpc, id: "npc-2", name: "Elara" }];
      vi.mocked(findNpcsByCampaignId).mockResolvedValue(npcs);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.npcs).toHaveLength(2);
      await app.close();
    });

    it("should return empty array when no NPCs", async () => {
      vi.mocked(findNpcsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.npcs).toEqual([]);
      await app.close();
    });

    it("should pass query filters to repository", async () => {
      vi.mocked(findNpcsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs?search=Grog&status=alive&importance=major&limit=10&offset=5`,
        headers: { cookie: getAuthCookie() },
      });

      expect(findNpcsByCampaignId).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({
          search: "Grog",
          status: "alive",
          importance: "major",
          limit: 10,
          offset: 5,
        })
      );
      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
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
        url: `/api/campaigns/${mockCampaignId}/npcs`,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/npcs/:id", () => {
    it("should return 200 and NPC details", async () => {
      vi.mocked(findNpcByIdAndCampaignId).mockResolvedValue(mockNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.npc.id).toBe(mockNpcId);
      expect(body.npc.name).toBe("Grog the Brave");
      await app.close();
    });

    it("should return 404 when NPC not found", async () => {
      vi.mocked(findNpcByIdAndCampaignId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("NPC not found");
      await app.close();
    });

    it("should return 400 for invalid NPC ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs/not-a-uuid`,
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
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("PATCH /api/campaigns/:campaignId/npcs/:id", () => {
    it("should return 200 and updated NPC", async () => {
      const updatedNpc = { ...mockNpc, name: "Grog the Mighty" };
      vi.mocked(updateNpc).mockResolvedValue(updatedNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "Grog the Mighty" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.npc.name).toBe("Grog the Mighty");

      expect(updateNpc).toHaveBeenCalledWith(mockNpcId, mockCampaignId, {
        name: "Grog the Mighty",
      });
      await app.close();
    });

    it("should update status only", async () => {
      const updatedNpc = { ...mockNpc, status: "dead" as const };
      vi.mocked(updateNpc).mockResolvedValue(updatedNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
        payload: { status: "dead" },
      });

      expect(response.statusCode).toBe(200);
      expect(updateNpc).toHaveBeenCalledWith(mockNpcId, mockCampaignId, {
        status: "dead",
      });
      await app.close();
    });

    it("should return 400 when no fields to update", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("No fields to update");
      expect(updateNpc).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 404 when NPC not found", async () => {
      vi.mocked(updateNpc).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "Updated NPC" },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("should return 400 for empty name", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
        payload: { name: "" },
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
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("DELETE /api/campaigns/:campaignId/npcs/:id", () => {
    it("should return 204 on successful deletion", async () => {
      vi.mocked(deleteNpc).mockResolvedValue(mockNpc);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(deleteNpc).toHaveBeenCalledWith(mockNpcId, mockCampaignId);
      await app.close();
    });

    it("should return 404 when NPC not found", async () => {
      vi.mocked(deleteNpc).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("NPC not found");
      await app.close();
    });

    it("should return 400 for invalid NPC ID format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/npcs/not-a-uuid`,
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
        url: `/api/campaigns/${mockCampaignId}/npcs/${mockNpcId}`,
      });

      expect(response.statusCode).toBe(401);
      expect(deleteNpc).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe("User Isolation", () => {
    it("should deny access when campaign belongs to different user", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/npcs`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      expect(findCampaignByIdAndUserId).toHaveBeenCalledWith(
        mockCampaignId,
        mockUserId
      );
      await app.close();
    });
  });
});
