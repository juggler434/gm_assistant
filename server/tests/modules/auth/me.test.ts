import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing routes
vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
  invalidateSession: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: {
    verify: vi.fn(),
    hash: vi.fn(),
  },
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

import { findUserById } from "@/modules/auth/repository.js";
import { validateSessionToken } from "@/modules/auth/session.js";
import type { User } from "@/db/schema/index.js";

describe("GET /api/auth/me", () => {
  const mockUser: User = {
    id: "user-123",
    email: "test@example.com",
    passwordHash: "hashed-password",
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockValidSession = {
    ok: true as const,
    value: {
      id: "session-123",
      userId: "user-123",
      createdAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildTestApp() {
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  it("should return 200 and user data when authenticated", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session_token: "valid-session.token" },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.user).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    });

    expect(findUserById).toHaveBeenCalledWith("user-123");

    await app.close();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      ok: false,
      error: { code: "SESSION_NOT_FOUND" },
    });

    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Unauthorized");

    await app.close();
  });

  it("should return 404 when user not found in database", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(null);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session_token: "valid-session.token" },
    });

    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Not Found");

    await app.close();
  });

  it("should not include passwordHash in the response", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session_token: "valid-session.token" },
    });

    const body = JSON.parse(response.body);
    expect(body.user).not.toHaveProperty("passwordHash");

    await app.close();
  });
});
