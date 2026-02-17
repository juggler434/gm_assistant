// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loginBodySchema } from "@/modules/auth/schemas.js";

// Mock dependencies before importing routes
vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
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
import { findUserByEmail } from "@/modules/auth/repository.js";
import { createSession } from "@/modules/auth/session.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

describe("Login Schema Validation", () => {
  describe("loginBodySchema", () => {
    it("should accept valid email and password", () => {
      const result = loginBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
        expect(result.data.password).toBe("password123");
      }
    });

    it("should reject invalid email format", () => {
      const result = loginBodySchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty email", () => {
      const result = loginBodySchema.safeParse({
        email: "",
        password: "password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty password", () => {
      const result = loginBodySchema.safeParse({
        email: "test@example.com",
        password: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing email", () => {
      const result = loginBodySchema.safeParse({
        password: "password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing password", () => {
      const result = loginBodySchema.safeParse({
        email: "test@example.com",
      });

      expect(result.success).toBe(false);
    });

    it("should accept any non-empty password (no min length for login)", () => {
      const result = loginBodySchema.safeParse({
        email: "test@example.com",
        password: "a",
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("Login Route Handler", () => {
  const mockUser: User = {
    id: "user-123",
    email: "test@example.com",
    passwordHash: "hashed-password",
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSessionResult = {
    ok: true as const,
    value: {
      session: {
        id: "session-123",
        userId: "user-123",
        createdAt: new Date(),
        lastVerifiedAt: new Date(),
      },
      token: "session-token.secret",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to build app with mocked dependencies
  async function buildTestApp() {
    // Dynamic import to ensure mocks are in place
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  it("should return 200 and user data on valid credentials", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.user).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    });

    // Verify session cookie is set
    const cookies = response.cookies;
    const sessionCookie = cookies.find((c) => c.name === "session_token");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toBe("session-token.secret");

    await app.close();
  });

  it("should return 401 for non-existent user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "nonexistent@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("Invalid credentials");

    // Should not attempt password verification
    expect(argon2.verify).not.toHaveBeenCalled();

    await app.close();
  });

  it("should return 401 for wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(false);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "wrongpassword",
      },
    });

    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("Invalid credentials");

    // Should not create session
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it("should return 400 for invalid email format", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "not-an-email",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 400 for missing password", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 500 when session creation fails", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue({
      ok: false,
      error: { code: "DATABASE_ERROR", cause: new Error("Redis down") },
    });

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("Failed to create session");

    await app.close();
  });

  it("should use same error message for invalid email and password (prevent enumeration)", async () => {
    const app = await buildTestApp();

    // Test non-existent user
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const response1 = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "nonexistent@example.com",
        password: "password123",
      },
    });

    // Test wrong password
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(false);

    const response2 = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "wrongpassword",
      },
    });

    const body1 = JSON.parse(response1.body);
    const body2 = JSON.parse(response2.body);

    // Both should return identical error responses
    expect(body1.statusCode).toBe(body2.statusCode);
    expect(body1.error).toBe(body2.error);
    expect(body1.message).toBe(body2.message);

    await app.close();
  });

  it("should verify password against the stored hash", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(argon2.verify).toHaveBeenCalledWith("hashed-password", "password123");

    await app.close();
  });

  it("should create session with user ID on successful login", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(createSession).toHaveBeenCalledWith("user-123");

    await app.close();
  });
});
