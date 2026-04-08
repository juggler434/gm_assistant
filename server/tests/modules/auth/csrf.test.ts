// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing anything else
vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: { verify: vi.fn(), hash: vi.fn() },
  verify: vi.fn(),
  hash: vi.fn(),
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

import { validateSessionToken } from "@/modules/auth/session.js";

describe("CSRF protection middleware", () => {
  const validatedSession = {
    ok: true as const,
    value: {
      id: "session-xyz-789",
      userId: "user-abc-123",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastVerifiedAt: new Date("2025-01-01T00:00:00Z"),
    },
  };

  const sessionCookie = "session_token=abcdefghijkmnpqrstuvwx.yz234567890abcdefghijkm";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSessionToken).mockResolvedValue(validatedSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildTestApp() {
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  it("rejects POST to a protected route with a foreign Origin header", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie: sessionCookie,
        origin: "https://evil.example.com",
        host: "localhost:3000",
      },
      payload: { name: "Hijacked Campaign" },
    });

    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Invalid request origin");

    await app.close();
  });

  it("rejects POST to /api/auth/login with a foreign Origin header", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: "https://attacker.example.com",
        host: "localhost:3000",
      },
      payload: { email: "player@example.com", password: "securepass123" },
    });

    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Forbidden");

    await app.close();
  });

  it("allows POST when Origin matches Host", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie: sessionCookie,
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      payload: { name: "Legit Campaign" },
    });

    // Should not be blocked by CSRF (may fail later for other reasons,
    // but specifically not 403 from origin verification).
    expect(response.statusCode).not.toBe(403);

    await app.close();
  });

  it("skips CSRF check for GET requests with a foreign Origin", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: {
        cookie: sessionCookie,
        origin: "https://evil.example.com",
        host: "localhost:3000",
      },
    });

    // GET is exempt from CSRF protection.
    expect(response.statusCode).not.toBe(403);

    await app.close();
  });

  it("does not apply CSRF check to non-/api routes", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://evil.example.com",
        host: "localhost:3000",
      },
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
