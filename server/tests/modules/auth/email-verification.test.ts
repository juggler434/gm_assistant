// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing routes
vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  markEmailVerified: vi.fn(),
  isEmailVerified: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
  invalidateSession: vi.fn(),
}));

vi.mock("@/modules/auth/email-verification.js", () => ({
  createVerificationToken: vi.fn(),
  consumeVerificationToken: vi.fn(),
  VERIFICATION_TOKEN_TTL_SECONDS: 86400,
}));

vi.mock("@/services/email/factory.js", () => ({
  getEmailService: vi.fn(() => ({
    sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    sendDuplicateRegistrationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    providerName: "log",
  })),
  createEmailService: vi.fn(),
  __resetEmailServiceForTests: vi.fn(),
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

import { findUserByEmail, findUserById, createUser, markEmailVerified } from "@/modules/auth/repository.js";
import { createSession, validateSessionToken } from "@/modules/auth/session.js";
import { createVerificationToken, consumeVerificationToken } from "@/modules/auth/email-verification.js";
import { getEmailService } from "@/services/email/factory.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

const baseUser: User = {
  id: "user-123",
  email: "test@example.com",
  passwordHash: "hashed-pw",
  name: "Test User",
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const verifiedUser: User = {
  ...baseUser,
  emailVerifiedAt: new Date("2026-01-01"),
};

const mockSessionResult = {
  ok: true as const,
  value: {
    session: { id: "sess-1", userId: "user-123", createdAt: new Date(), lastVerifiedAt: new Date() },
    token: "sess.secret",
  },
};

async function buildTestApp() {
  const { buildApp } = await import("@/app.js");
  return buildApp({ logger: false });
}

function authenticatedSession() {
  vi.mocked(validateSessionToken).mockResolvedValue({
    ok: true,
    value: { id: "sess-1", userId: "user-123", createdAt: new Date(), lastVerifiedAt: new Date() },
  });
}

describe("GET /api/auth/verify-email", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when token query param is missing", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/verify-email" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/Missing or invalid token/);
    await app.close();
  });

  it("returns 400 when token is invalid or expired", async () => {
    vi.mocked(consumeVerificationToken).mockResolvedValue({
      ok: false,
      error: { code: "TOKEN_NOT_FOUND" },
    });
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/verify-email?token=bad-token" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/Invalid or expired/);
    await app.close();
  });

  it("marks user as verified and returns 200 on success", async () => {
    vi.mocked(consumeVerificationToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(markEmailVerified).mockResolvedValue(verifiedUser);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/verify-email?token=valid-token" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.id).toBe("user-123");

    expect(consumeVerificationToken).toHaveBeenCalledWith("valid-token");
    expect(markEmailVerified).toHaveBeenCalledWith("user-123");
    await app.close();
  });

  it("returns 404 when user was deleted before verifying", async () => {
    vi.mocked(consumeVerificationToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(markEmailVerified).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/verify-email?token=valid-token" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/auth/resend-verification", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns 401 without a session", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/auth/resend-verification" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 if already verified", async () => {
    authenticatedSession();
    vi.mocked(findUserById).mockResolvedValue(verifiedUser);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      cookies: { session_token: "sess.secret" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/already verified/);
    await app.close();
  });

  it("sends verification email and returns 200 for unverified user", async () => {
    authenticatedSession();
    vi.mocked(findUserById).mockResolvedValue(baseUser);
    vi.mocked(createVerificationToken).mockResolvedValue({
      ok: true,
      value: { token: "new-token", expiresAt: new Date(Date.now() + 86400000) },
    });

    const mockSend = vi.fn().mockResolvedValue({ ok: true, value: {} });
    vi.mocked(getEmailService).mockReturnValue({
      sendVerificationEmail: mockSend,
      providerName: "log",
    } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      cookies: { session_token: "sess.secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe("Verification email sent");
    expect(createVerificationToken).toHaveBeenCalledWith("user-123", 86400);
    expect(mockSend).toHaveBeenCalled();
    await app.close();
  });
});

describe("Registration sends verification email", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns generic success message on register (no user data)", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-pw");
    vi.mocked(createUser).mockResolvedValue(baseUser);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);
    vi.mocked(createVerificationToken).mockResolvedValue({
      ok: true,
      value: { token: "tok", expiresAt: new Date(Date.now() + 86400000) },
    });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@example.com", password: "password123", name: "Test User" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Registration successful. Please check your email to verify your account.");
    // No user object exposed — prevents enumeration
    expect(body.user).toBeUndefined();
    await app.close();
  });
});

describe("Login includes emailVerified status", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns emailVerified: false for unverified user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(baseUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.emailVerified).toBe(false);
    await app.close();
  });

  it("returns emailVerified: true for verified user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(verifiedUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.emailVerified).toBe(true);
    await app.close();
  });
});
