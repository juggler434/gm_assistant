// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Campaign } from "@/db/schema/campaigns.js";
import type { GameSessionRow } from "@/db/schema/sessions.js";
import FormData from "form-data";

const mockQueueAdd = vi.fn();

vi.mock("@/modules/sessions/repository.js", () => ({
  createSession: vi.fn(),
  findSessionsByCampaignId: vi.fn(),
  findSessionByIdAndCampaignId: vi.fn(),
  findTranscriptBySessionId: vi.fn(),
  updateSessionStatus: vi.fn(),
  addMarkerToTranscript: vi.fn(),
  deleteMarkerFromTranscript: vi.fn(),
  findSummaryBySessionId: vi.fn(),
  createSummary: vi.fn(),
  updateSummary: vi.fn(),
}));

vi.mock("@/modules/documents/repository.js", () => ({
  createDocument: vi.fn(),
  findDocumentsByCampaignId: vi.fn(),
  findDocumentByIdAndCampaignId: vi.fn(),
  updateDocument: vi.fn(),
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
    uploadByKey: vi.fn(),
    delete: vi.fn(),
    deleteByKey: vi.fn(),
    getSignedUrl: vi.fn(),
    getSignedUrlByKey: vi.fn(),
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

import {
  createSession,
  findSessionsByCampaignId,
  findSessionByIdAndCampaignId,
  findTranscriptBySessionId,
  addMarkerToTranscript,
  deleteMarkerFromTranscript,
  findSummaryBySessionId,
  createSummary,
  updateSummary,
} from "@/modules/sessions/repository.js";
import type { SessionSummaryRow } from "@/db/schema/session-summaries.js";
import { findCampaignByIdAndUserId } from "@/modules/campaigns/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";
import { createStorageService } from "@/services/storage/factory.js";

describe("Session Routes", () => {
  const mockUserId = "user-123";
  const mockCampaignId = "123e4567-e89b-12d3-a456-426614174000";
  const mockSessionId = "456e7890-e89b-12d3-a456-426614174001";

  const mockCampaign: Campaign = {
    id: mockCampaignId,
    userId: mockUserId,
    name: "Test Campaign",
    description: "A test campaign",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockGameSession: GameSessionRow = {
    id: mockSessionId,
    campaignId: mockCampaignId,
    createdBy: mockUserId,
    title: "Session 1",
    date: new Date(),
    status: "processing",
    audioPath: `campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
    duration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAuthResult = {
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
    uploadByKey: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteByKey: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
    getSignedUrlByKey: ReturnType<typeof vi.fn>;
    ensureBucket: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueueAdd.mockResolvedValue({ ok: true, value: "job-123" });
    vi.mocked(validateSessionToken).mockResolvedValue(mockAuthResult);
    vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(mockCampaign);

    mockStorageService = {
      upload: vi.fn().mockResolvedValue({
        ok: true,
        value: { key: `campaigns/${mockCampaignId}/sessions/${mockSessionId}` },
      }),
      uploadByKey: vi.fn().mockResolvedValue({
        ok: true,
        value: { key: `campaigns/${mockCampaignId}/sessions/${mockSessionId}` },
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      deleteByKey: vi.fn().mockResolvedValue({ ok: true }),
      getSignedUrl: vi.fn(),
      getSignedUrlByKey: vi.fn(),
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
    vi.resetModules();
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  function getAuthCookie() {
    return "session_token=valid-token.secret";
  }

  describe("POST /api/campaigns/:campaignId/sessions", () => {
    it("should return 201 and session on successful audio upload", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("fake mp3 audio data"), {
        filename: "session-recording.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.session.title).toBe("Session 1");
      expect(body.session.status).toBe("processing");

      await app.close();
    });

    it("should accept WAV audio uploads", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("fake wav data"), {
        filename: "recording.wav",
        contentType: "audio/wav",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);

      await app.close();
    });

    it("should accept M4A audio uploads", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("fake m4a data"), {
        filename: "recording.m4a",
        contentType: "audio/mp4",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(201);

      await app.close();
    });

    it("should return 400 for unsupported audio format", async () => {
      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("fake ogg data"), {
        filename: "recording.ogg",
        contentType: "audio/ogg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("Unsupported audio format");

      await app.close();
    });

    it("should return 400 for non-audio file types", async () => {
      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("pdf content"), {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("Unsupported audio format");

      await app.close();
    });

    it("should return 400 when no file uploaded", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
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
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
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
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should return 400 for invalid campaign ID format", async () => {
      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns/not-a-uuid/sessions",
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should call uploadByKey with correct audio path", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio content"), {
        filename: "my-session.mp3",
        contentType: "audio/mpeg",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(mockStorageService.uploadByKey).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^campaigns/${mockCampaignId}/sessions/[0-9a-f-]+$`)
        ),
        expect.any(Buffer),
        {
          contentType: "audio/mpeg",
          metadata: { originalFilename: "my-session.mp3" },
        }
      );

      await app.close();
    });

    it("should queue transcription job with correct data", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(mockQueueAdd).toHaveBeenCalledWith("transcribe-session", {
        sessionId: expect.any(String),
        campaignId: mockCampaignId,
        audioPath: expect.stringContaining(`campaigns/${mockCampaignId}/sessions/`),
        mimeType: "audio/mpeg",
      });

      await app.close();
    });

    it("should create session with title from metadata field", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "recording.mp3",
        contentType: "audio/mpeg",
      });
      form.append("title", "Dragon's Lair Session");

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(vi.mocked(createSession)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Dragon's Lair Session",
        })
      );

      await app.close();
    });

    it("should default title to filename without extension when no title provided", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "epic-battle-recording.mp3",
        contentType: "audio/mpeg",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(vi.mocked(createSession)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "epic-battle-recording",
        })
      );

      await app.close();
    });

    it("should return 500 when storage upload fails", async () => {
      mockStorageService.uploadByKey.mockResolvedValue({
        ok: false,
        error: { code: "STORAGE_ERROR", message: "Upload failed" },
      });

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to upload audio file");
      expect(vi.mocked(createSession)).not.toHaveBeenCalled();

      await app.close();
    });

    it("should return 500 and clean up storage when session creation fails", async () => {
      vi.mocked(createSession).mockResolvedValue(null);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to create session record");
      expect(mockStorageService.deleteByKey).toHaveBeenCalled();

      await app.close();
    });

    it("should create session with status 'processing'", async () => {
      vi.mocked(createSession).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const form = new FormData();
      form.append("file", Buffer.from("audio data"), {
        filename: "session.mp3",
        contentType: "audio/mpeg",
      });

      await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: {
          cookie: getAuthCookie(),
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(vi.mocked(createSession)).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "processing",
          campaignId: mockCampaignId,
          createdBy: mockUserId,
        })
      );

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/sessions", () => {
    it("should return 200 and list of sessions", async () => {
      const sessions = [
        mockGameSession,
        { ...mockGameSession, id: "session-2", title: "Session 2" },
      ];
      vi.mocked(findSessionsByCampaignId).mockResolvedValue(sessions);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(2);

      await app.close();
    });

    it("should return empty array when no sessions", async () => {
      vi.mocked(findSessionsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toEqual([]);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions`,
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
        url: `/api/campaigns/${mockCampaignId}/sessions`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should pass status filter to repository", async () => {
      vi.mocked(findSessionsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions?status=ready`,
        headers: { cookie: getAuthCookie() },
      });

      expect(vi.mocked(findSessionsByCampaignId)).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({ status: "ready" })
      );

      await app.close();
    });

    it("should pass limit and offset to repository", async () => {
      vi.mocked(findSessionsByCampaignId).mockResolvedValue([]);

      const app = await buildTestApp();

      await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions?limit=10&offset=20`,
        headers: { cookie: getAuthCookie() },
      });

      expect(vi.mocked(findSessionsByCampaignId)).toHaveBeenCalledWith(
        mockCampaignId,
        expect.objectContaining({ limit: 10, offset: 20 })
      );

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/sessions/:id", () => {
    it("should return 200 and session details", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockGameSession);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.id).toBe(mockSessionId);

      await app.close();
    });

    it("should return 404 when session not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Session not found");

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
        headers: { cookie: getAuthCookie() },
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
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  // ============================================================================
  // Summary Routes
  // ============================================================================

  const mockReadySession: GameSessionRow = {
    id: mockSessionId,
    campaignId: mockCampaignId,
    createdBy: mockUserId,
    title: "Session 1",
    date: new Date(),
    status: "ready",
    audioPath: `campaigns/${mockCampaignId}/sessions/${mockSessionId}`,
    duration: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSummary: SessionSummaryRow = {
    id: "summary-123",
    sessionId: mockSessionId,
    content: "The party ventured into the dungeon.",
    keyEvents: ["Defeated the goblin king"],
    npcsEncountered: ["Goblin King"],
    locationsVisited: ["Dark Dungeon"],
    itemsAcquired: ["Sword of Light"],
    openQuestions: ["What lies deeper?"],
    status: "ready",
    generationError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("POST /api/campaigns/:campaignId/sessions/:id/summary", () => {
    it("should return 202 and queue summary generation", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue(null);
      vi.mocked(createSummary).mockResolvedValue({
        ...mockSummary,
        status: "generating",
        content: "",
        keyEvents: [],
        npcsEncountered: [],
        locationsVisited: [],
        itemsAcquired: [],
        openQuestions: [],
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.summary).toBeDefined();
      expect(body.summary.status).toBe("generating");

      await app.close();
    });

    it("should return 400 if session is not ready", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockGameSession); // status: "processing"

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 409 if summary is already generating", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue({
        ...mockSummary,
        status: "generating",
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(409);

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/sessions/:id/summary", () => {
    it("should return 200 and the summary", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue(mockSummary);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.content).toBe("The party ventured into the dungeon.");
      expect(body.summary.keyEvents).toEqual(["Defeated the goblin king"]);
      expect(body.summary.npcsEncountered).toEqual(["Goblin King"]);

      await app.close();
    });

    it("should return 404 when summary not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 401 without authentication", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("PATCH /api/campaigns/:campaignId/sessions/:id/summary", () => {
    it("should return 200 and updated summary", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue(mockSummary);
      vi.mocked(updateSummary).mockResolvedValue({
        ...mockSummary,
        content: "Updated summary content",
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ content: "Updated summary content" }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.content).toBe("Updated summary content");

      await app.close();
    });

    it("should return 404 when summary not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findSummaryBySessionId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "PATCH",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/summary`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ content: "Updated" }),
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  // ============================================================================
  // Marker Routes
  // ============================================================================

  const mockTranscript = {
    id: "transcript-123",
    sessionId: mockSessionId,
    content: "The party enters the dungeon. A dragon appears. They fight bravely.",
    segments: [
      { startTime: 0, endTime: 10, speaker: "GM", text: "The party enters the dungeon." },
      { startTime: 10, endTime: 25, speaker: "GM", text: "A dragon appears from the shadows." },
      { startTime: 25, endTime: 40, speaker: "Player1", text: "I draw my sword and attack!" },
      { startTime: 40, endTime: 55, speaker: "GM", text: "The dragon breathes fire." },
    ],
    markers: [
      { time: 12, label: "Dragon encounter", type: "combat", notes: null },
      { time: 42, label: "Dragon breath", type: "important", notes: "Nearly killed Player1" },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("POST /api/campaigns/:campaignId/sessions/:id/markers", () => {
    it("should return 201 and add a marker", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);
      vi.mocked(addMarkerToTranscript).mockResolvedValue({
        ...mockTranscript,
        markers: [
          ...mockTranscript.markers,
          { time: 30, label: "Sword attack", type: "combat", notes: null },
        ],
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          label: "Sword attack",
          time: 30,
          type: "combat",
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.marker.label).toBe("Sword attack");
      expect(body.marker.time).toBe(30);
      expect(body.marker.type).toBe("combat");

      await app.close();
    });

    it("should default type to 'general' when not provided", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);
      vi.mocked(addMarkerToTranscript).mockResolvedValue(mockTranscript);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Note", time: 15 }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.marker.type).toBe("general");

      await app.close();
    });

    it("should return 400 when label is missing", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ time: 15 }),
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 400 when time is missing", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Note" }),
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("should return 404 when transcript not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Note", time: 15 }),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Transcript not found");

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: {
          cookie: getAuthCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Note", time: 15 }),
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
        method: "POST",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "Note", time: 15 }),
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("GET /api/campaigns/:campaignId/sessions/:id/markers", () => {
    it("should return 200 and markers list", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.markers).toHaveLength(2);
      expect(body.markers[0].label).toBe("Dragon encounter");
      expect(body.markers[1].label).toBe("Dragon breath");

      await app.close();
    });

    it("should return markers with context when context=true", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(mockTranscript);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers?context=true&window=15`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.markers).toHaveLength(2);

      // First marker at time=12, window=15 → segments from -3 to 27
      const first = body.markers[0];
      expect(first.marker.label).toBe("Dragon encounter");
      expect(first.segments.length).toBeGreaterThan(0);
      // Should include segments that overlap [0, 27] (startTime <= 27 && endTime >= -3)
      expect(first.segments.some((s: { text: string }) => s.text.includes("dragon"))).toBe(true);

      await app.close();
    });

    it("should return empty markers array when no markers exist", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue({
        ...mockTranscript,
        markers: [],
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.markers).toEqual([]);

      await app.close();
    });

    it("should return 404 when transcript not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(findTranscriptBySessionId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
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
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("DELETE /api/campaigns/:campaignId/sessions/:id/markers", () => {
    it("should return 200 and remove the marker", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(deleteMarkerFromTranscript).mockResolvedValue({
        ...mockTranscript,
        markers: [mockTranscript.markers[1]],
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers?time=12&label=Dragon%20encounter`,
        headers: {
          cookie: getAuthCookie(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.markers).toHaveLength(1);

      await app.close();
    });

    it("should return 404 when transcript not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      vi.mocked(deleteMarkerFromTranscript).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers?time=12&label=Dragon%20encounter`,
        headers: {
          cookie: getAuthCookie(),
        },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("should return 400 when time is missing", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "DELETE",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/markers?label=Dragon%20encounter`,
        headers: {
          cookie: getAuthCookie(),
        },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  // ============================================================================
  // Audio Routes
  // ============================================================================

  describe("GET /api/campaigns/:campaignId/sessions/:id/audio", () => {
    it("should return 200 and signed audio URL", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      mockStorageService.getSignedUrlByKey.mockResolvedValue({
        ok: true,
        value: {
          url: "https://storage.example.com/signed-audio-url",
          expiresAt: new Date("2026-03-20T12:00:00Z"),
        },
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.url).toBe("https://storage.example.com/signed-audio-url");
      expect(body.expiresAt).toBe("2026-03-20T12:00:00.000Z");

      await app.close();
    });

    it("should return 404 when session has no audio", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue({
        ...mockReadySession,
        audioPath: null,
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("No audio available for this session");

      await app.close();
    });

    it("should return 404 when session not found", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Session not found");

      await app.close();
    });

    it("should return 404 when campaign not found", async () => {
      vi.mocked(findCampaignByIdAndUserId).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Campaign not found");

      await app.close();
    });

    it("should return 500 when storage fails", async () => {
      vi.mocked(findSessionByIdAndCampaignId).mockResolvedValue(mockReadySession);
      mockStorageService.getSignedUrlByKey.mockResolvedValue({
        ok: false,
        error: { code: "STORAGE_ERROR", message: "Failed to generate URL" },
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Failed to generate audio URL");

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
        url: `/api/campaigns/${mockCampaignId}/sessions/${mockSessionId}/audio`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });
});
