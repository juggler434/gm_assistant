// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing anything else
vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  markEmailVerified: vi.fn(),
  isEmailVerified: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
  invalidateSession: vi.fn(),
  invalidateAllUserSessions: vi.fn(),
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

vi.mock("@/modules/auth/password-reset.js", () => ({
  createPasswordResetToken: vi.fn().mockResolvedValue({
    ok: true,
    value: { token: "test-reset-token", expiresAt: new Date(Date.now() + 3600000) },
  }),
  consumePasswordResetToken: vi.fn(),
  PASSWORD_RESET_TTL_SECONDS: 3600,
}));

const mockEmailServiceInstance = {
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  providerName: "log",
};

vi.mock("@/services/email/factory.js", () => ({
  getEmailService: vi.fn(() => mockEmailServiceInstance),
  createEmailService: vi.fn(),
  __resetEmailServiceForTests: vi.fn(),
}));

// Import mocked modules
import { findUserByEmail, updatePassword } from "@/modules/auth/repository.js";
import { invalidateAllUserSessions } from "@/modules/auth/session.js";
import { createPasswordResetToken, consumePasswordResetToken } from "@/modules/auth/password-reset.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

describe("Password Reset Flow", () => {
  const mockUser: User = {
    id: "user-abc-123",
    email: "player@example.com",
    passwordHash: "argon2-hashed-password",
    name: "Test Player",
    emailVerifiedAt: new Date("2025-01-15T00:00:00Z"),
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
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

  describe("POST /api/auth/forgot-password", () => {
    it("should return 200 with generic message when user exists", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "player@example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("If an account with that email exists");

      // Wait for fire-and-forget to complete
      await vi.waitFor(() => {
        expect(createPasswordResetToken).toHaveBeenCalledWith(mockUser.id, 3600);
      });
    });

    it("should return 200 with same generic message when user does NOT exist", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "nonexistent@example.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("If an account with that email exists");

      // Token should NOT have been created
      expect(createPasswordResetToken).not.toHaveBeenCalled();
    });

    it("should send a password reset email when user exists", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);

      const app = await buildTestApp();
      await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "player@example.com" },
      });

      // Wait for fire-and-forget to complete
      await expect.poll(() => {
        expect(mockEmailServiceInstance.sendPasswordResetEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: "player@example.com",
            recipientName: "Test Player",
          })
        );
      });
    });

    it("should return 400 for invalid email format", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "not-an-email" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for missing email", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("should reset password for valid token", async () => {
      vi.mocked(consumePasswordResetToken).mockResolvedValue({
        ok: true,
        value: mockUser.id,
      });
      vi.mocked(argon2.hash).mockResolvedValue("new-argon2-hash");
      vi.mocked(updatePassword).mockResolvedValue({ ...mockUser, passwordHash: "new-argon2-hash" });
      vi.mocked(invalidateAllUserSessions).mockResolvedValue(undefined);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-reset-token", password: "newpassword123" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Password reset successfully");

      expect(argon2.hash).toHaveBeenCalledWith("newpassword123");
      expect(updatePassword).toHaveBeenCalledWith(mockUser.id, "new-argon2-hash");
      expect(invalidateAllUserSessions).toHaveBeenCalledWith(mockUser.id);
    });

    it("should return 400 for invalid or expired token", async () => {
      vi.mocked(consumePasswordResetToken).mockResolvedValue({
        ok: false,
        error: { code: "TOKEN_NOT_FOUND" },
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "expired-token", password: "newpassword123" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Invalid or expired reset link");
    });

    it("should return 400 for password shorter than 8 characters", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-token", password: "short" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for password longer than 256 characters", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-token", password: "a".repeat(257) },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for missing token", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { password: "newpassword123" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for missing password", async () => {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-token" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 404 when user was deleted after token creation", async () => {
      vi.mocked(consumePasswordResetToken).mockResolvedValue({
        ok: true,
        value: "deleted-user-id",
      });
      vi.mocked(argon2.hash).mockResolvedValue("new-argon2-hash");
      vi.mocked(updatePassword).mockResolvedValue(null);

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-token", password: "newpassword123" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("User not found");
    });

    it("should return 500 on database error during token consumption", async () => {
      vi.mocked(consumePasswordResetToken).mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", cause: new Error("Redis down") },
      });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "valid-token", password: "newpassword123" },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
