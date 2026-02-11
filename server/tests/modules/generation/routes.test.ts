import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mock functions
const { mockGenerateAdventureHooks, mockFindCampaignByIdAndUserId } =
  vi.hoisted(() => ({
    mockGenerateAdventureHooks: vi.fn(),
    mockFindCampaignByIdAndUserId: vi.fn(),
  }));

vi.mock("@/modules/generation/generators/adventure-hook.js", () => ({
  generateAdventureHooks: mockGenerateAdventureHooks,
}));

vi.mock("@/modules/campaigns/repository.js", () => ({
  createCampaign: vi.fn(),
  findCampaignsByUserId: vi.fn(),
  findCampaignByIdAndUserId: mockFindCampaignByIdAndUserId,
  findCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
}));

vi.mock("@/services/llm/factory.js", () => ({
  createLLMService: vi.fn(() => ({
    chat: vi.fn(),
    generate: vi.fn(),
    generateStream: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
    providerName: "ollama",
    model: "llama3",
  })),
}));

vi.mock("@/services/metrics/service.js", () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  trackTimed: vi.fn(),
  isMetricsEnabled: vi.fn(() => false),
  shutdownMetrics: vi.fn(),
}));

import { validateSessionToken } from "@/modules/auth/session.js";

describe("Generation Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";

  const mockCampaign = {
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

  const mockHooksResult = {
    ok: true as const,
    value: {
      hooks: [
        {
          title: "The Shadow Conspiracy",
          description: "Dark forces gather beneath the city.",
          npcs: ["Lord Drayven"],
          locations: ["The Undercity"],
          factions: ["Shadowfang Clan"],
        },
        {
          title: "The Missing Diplomat",
          description: "A key diplomat has vanished during negotiations.",
          npcs: ["Ambassador Kael"],
          locations: ["The Great Hall"],
          factions: ["The Council"],
        },
        {
          title: "Ruins of the Ancients",
          description: "Ancient ruins have been uncovered near the border.",
          npcs: ["Scholar Miriel"],
          locations: ["Ashwood Ruins"],
          factions: ["The Seekers"],
        },
      ],
      sources: [
        {
          documentName: "Setting Guide",
          documentId: "doc-001",
          documentType: "setting",
          pageNumber: 3,
          section: "World Lore",
          relevanceScore: 0.9,
        },
      ],
      chunksUsed: 2,
      usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSessionToken).mockResolvedValue(mockSessionResult);
    mockFindCampaignByIdAndUserId.mockResolvedValue(mockCampaign);
    mockGenerateAdventureHooks.mockResolvedValue(mockHooksResult);
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

  describe("POST /api/campaigns/:campaignId/generate/hooks", () => {
    it("should return 200 with generated hooks on success", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.hooks).toHaveLength(3);
      expect(body.hooks[0].title).toBe("The Shadow Conspiracy");
      expect(body.sources).toHaveLength(1);
      expect(body.chunksUsed).toBe(2);
      expect(body.usage).toEqual({
        promptTokens: 500,
        completionTokens: 300,
        totalTokens: 800,
      });

      await app.close();
    });

    it("should pass tone and theme to generator", async () => {
      const app = await buildTestApp();

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: {
          tone: "dark",
          theme: "political intrigue",
          partyLevel: 5,
        },
      });

      expect(mockGenerateAdventureHooks).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: mockCampaignId,
          tone: "dark",
          theme: "political intrigue",
          partyLevel: 5,
        }),
        expect.anything(),
      );

      await app.close();
    });

    it("should return 400 for invalid campaign ID", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns/not-a-uuid/generate/hooks",
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

      await app.close();
    });

    it("should return 400 for missing tone", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

      await app.close();
    });

    it("should return 400 for invalid tone value", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "silly" },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 for party level out of range", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark", partyLevel: 25 },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      mockFindCampaignByIdAndUserId.mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
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

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(401);
      expect(mockGenerateAdventureHooks).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 502 when generation fails", async () => {
      mockGenerateAdventureHooks.mockResolvedValue({
        ok: false,
        error: {
          code: "GENERATION_FAILED",
          message: "LLM generation failed: Model not found",
        },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(502);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("GENERATION_FAILED");
      expect(body.message).toContain("Model not found");

      await app.close();
    });

    it("should return 502 when embedding fails", async () => {
      mockGenerateAdventureHooks.mockResolvedValue({
        ok: false,
        error: {
          code: "EMBEDDING_FAILED",
          message: "Embedding request failed",
        },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(502);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("EMBEDDING_FAILED");

      await app.close();
    });

    it("should return 502 when parse fails", async () => {
      mockGenerateAdventureHooks.mockResolvedValue({
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: "Failed to parse LLM response as JSON",
        },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark" },
      });

      expect(response.statusCode).toBe(502);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("PARSE_ERROR");

      await app.close();
    });

    it("should accept all valid tone values", async () => {
      const tones = [
        "dark",
        "comedic",
        "political",
        "mysterious",
        "heroic",
        "horror",
        "intrigue",
      ];

      const app = await buildTestApp();

      for (const tone of tones) {
        const response = await app.inject({
          method: "POST",
          url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
          headers: { cookie: getAuthCookie() },
          payload: { tone },
        });

        expect(response.statusCode).toBe(200);
      }

      await app.close();
    });

    it("should accept optional count parameter", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark", count: 5 },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it("should return 400 for count above max", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
        headers: { cookie: getAuthCookie() },
        payload: { tone: "dark", count: 11 },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    describe("SSE streaming", () => {
      it("should stream hooks as SSE events when Accept: text/event-stream", async () => {
        const app = await buildTestApp();

        const response = await app.inject({
          method: "POST",
          url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
          headers: {
            cookie: getAuthCookie(),
            accept: "text/event-stream",
          },
          payload: { tone: "dark" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe("text/event-stream");

        // Parse SSE events from response body
        const events = response.body
          .split("\n\n")
          .filter((e) => e.startsWith("data: "))
          .map((e) => JSON.parse(e.replace("data: ", "")));

        // First event: status message
        expect(events[0].type).toBe("status");
        expect(events[0].message).toContain("Generating");

        // Next events: individual hooks
        const hookEvents = events.filter((e) => e.type === "hook");
        expect(hookEvents).toHaveLength(3);
        expect(hookEvents[0].hook.title).toBe("The Shadow Conspiracy");

        // Last event: completion with metadata
        const completeEvent = events.find((e) => e.type === "complete");
        expect(completeEvent).toBeDefined();
        expect(completeEvent.sources).toHaveLength(1);
        expect(completeEvent.chunksUsed).toBe(2);

        await app.close();
      });

      it("should stream error event when generation fails", async () => {
        mockGenerateAdventureHooks.mockResolvedValue({
          ok: false,
          error: {
            code: "GENERATION_FAILED",
            message: "LLM generation failed",
          },
        });

        const app = await buildTestApp();

        const response = await app.inject({
          method: "POST",
          url: `/api/campaigns/${mockCampaignId}/generate/hooks`,
          headers: {
            cookie: getAuthCookie(),
            accept: "text/event-stream",
          },
          payload: { tone: "dark" },
        });

        expect(response.statusCode).toBe(200);

        const events = response.body
          .split("\n\n")
          .filter((e) => e.startsWith("data: "))
          .map((e) => JSON.parse(e.replace("data: ", "")));

        const errorEvent = events.find((e) => e.type === "error");
        expect(errorEvent).toBeDefined();
        expect(errorEvent.error).toBe("GENERATION_FAILED");

        await app.close();
      });
    });
  });
});
