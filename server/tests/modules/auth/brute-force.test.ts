// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("@/modules/auth/email-verification.js", () => ({
  createVerificationToken: vi.fn().mockResolvedValue({
    ok: true,
    value: { token: "test-verify-token", expiresAt: new Date(Date.now() + 86400000) },
  }),
  consumeVerificationToken: vi.fn(),
  VERIFICATION_TOKEN_TTL_SECONDS: 86400,
}));

vi.mock("@/services/email/factory.js", () => ({
  getEmailService: vi.fn(() => ({
    sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    providerName: "log",
  })),
  createEmailService: vi.fn(),
  __resetEmailServiceForTests: vi.fn(),
}));

vi.mock("@/modules/auth/brute-force.js", () => ({
  checkBruteForce: vi.fn().mockResolvedValue({ locked: false, attempts: 0, retryAfter: 0 }),
  recordFailedAttempt: vi.fn().mockResolvedValue({ locked: false, attempts: 1, retryAfter: 0 }),
  resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_SECONDS: 900,
}));

import { findUserByEmail } from "@/modules/auth/repository.js";
import { createSession } from "@/modules/auth/session.js";
import { checkBruteForce, recordFailedAttempt, resetFailedAttempts } from "@/modules/auth/brute-force.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

describe("Brute-force protection on /login", () => {
  const mockUser: User = {
    id: "user-123",
    email: "test@example.com",
    passwordHash: "hashed-password",
    name: "Test User",
    emailVerifiedAt: null,
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

  async function buildTestApp() {
    const { buildApp } = await import("@/app.js");
    return buildApp({ logger: false });
  }

  it("should return 429 when account is locked out", async () => {
    vi.mocked(checkBruteForce).mockResolvedValue({
      locked: true,
      attempts: 5,
      retryAfter: 800,
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

    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Too Many Requests");
    expect(body.message).toContain("Too many failed login attempts");
    expect(response.headers["retry-after"]).toBe("800");

    // Should NOT attempt to look up the user or verify password
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(argon2.verify).not.toHaveBeenCalled();

    await app.close();
  });

  it("should record a failed attempt on wrong password", async () => {
    vi.mocked(checkBruteForce).mockResolvedValue({ locked: false, attempts: 2, retryAfter: 0 });
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
    expect(recordFailedAttempt).toHaveBeenCalledWith("test@example.com");

    await app.close();
  });

  it("should record a failed attempt on non-existent user", async () => {
    vi.mocked(checkBruteForce).mockResolvedValue({ locked: false, attempts: 0, retryAfter: 0 });
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "nobody@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(recordFailedAttempt).toHaveBeenCalledWith("nobody@example.com");

    await app.close();
  });

  it("should reset failed attempts on successful login", async () => {
    vi.mocked(checkBruteForce).mockResolvedValue({ locked: false, attempts: 3, retryAfter: 0 });
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
    expect(resetFailedAttempts).toHaveBeenCalledWith("test@example.com");
    expect(recordFailedAttempt).not.toHaveBeenCalled();

    await app.close();
  });

  it("should block valid credentials when account is locked", async () => {
    // This is the key security test: even with the right password,
    // a locked account must be rejected.
    vi.mocked(checkBruteForce).mockResolvedValue({
      locked: true,
      attempts: 5,
      retryAfter: 600,
    });
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

    expect(response.statusCode).toBe(429);
    // Password verification should never be reached
    expect(argon2.verify).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it("should not check brute-force on validation errors", async () => {
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
    expect(checkBruteForce).not.toHaveBeenCalled();

    await app.close();
  });
});
