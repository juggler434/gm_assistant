// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as OTPAuth from "otpauth";

// --- Mocks (must be declared before importing the app) -----------------

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
  default: { verify: vi.fn(), hash: vi.fn() },
  verify: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("@/modules/auth/brute-force.js", () => ({
  checkBruteForce: vi.fn().mockResolvedValue({ locked: false, attempts: 0, retryAfter: 0 }),
  recordFailedAttempt: vi.fn().mockResolvedValue({ locked: false, attempts: 1, retryAfter: 0 }),
  resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
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
  createVerificationToken: vi.fn(),
  consumeVerificationToken: vi.fn(),
  VERIFICATION_TOKEN_TTL_SECONDS: 86400,
}));

vi.mock("@/modules/auth/password-reset.js", () => ({
  createPasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  PASSWORD_RESET_TTL_SECONDS: 3600,
}));

vi.mock("@/services/email/factory.js", () => ({
  getEmailService: vi.fn(() => ({
    sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    sendDuplicateRegistrationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    providerName: "log",
  })),
  createEmailService: vi.fn(),
  __resetEmailServiceForTests: vi.fn(),
}));

vi.mock("@/modules/auth/audit-log.js", () => ({
  recordAuthEvent: vi.fn(),
  purgeOldAuthEvents: vi.fn(),
}));

vi.mock("@/modules/auth/mfa-repository.js", () => ({
  findUserMfa: vi.fn(),
  upsertPendingSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  consumeRecoveryCodeHash: vi.fn(),
}));

vi.mock("@/modules/auth/mfa-pending.js", () => ({
  createMfaPendingToken: vi.fn(),
  consumeMfaPendingToken: vi.fn(),
  peekMfaPendingToken: vi.fn(),
  MFA_PENDING_TTL_SECONDS: 300,
}));

// --- Imports from mocked modules ---------------------------------------

import * as argon2 from "argon2";
import { findUserByEmail, findUserById } from "@/modules/auth/repository.js";
import { createSession, validateSessionToken } from "@/modules/auth/session.js";
import {
  findUserMfa,
  upsertPendingSecret,
  enableMfa,
  disableMfa,
  consumeRecoveryCodeHash,
} from "@/modules/auth/mfa-repository.js";
import {
  createMfaPendingToken,
  consumeMfaPendingToken,
} from "@/modules/auth/mfa-pending.js";
import {
  encryptSecret,
  generateTotpSecret,
  hashRecoveryCode,
} from "@/modules/auth/mfa.js";
import type { User, UserMfa } from "@/db/schema/index.js";

// --- Fixtures ----------------------------------------------------------

const mockUser: User = {
  id: "user-123",
  email: "test@example.com",
  passwordHash: "hashed-password",
  name: "Test User",
  emailVerifiedAt: new Date(),
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

function makeMfa(overrides: Partial<UserMfa> = {}): UserMfa {
  const secret = overrides.secretEncrypted ?? encryptSecret(generateTotpSecret());
  return {
    id: "mfa-row-1",
    userId: "user-123",
    secretEncrypted: secret,
    enabledAt: null,
    recoveryCodesHash: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function generateCurrentTotpCode(base32Secret: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.generate();
}

async function buildTestApp() {
  const { buildApp } = await import("@/app.js");
  return buildApp({ logger: false });
}

// --- Tests -------------------------------------------------------------

describe("POST /api/auth/mfa/setup", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns a secret and otpauth URI for an authenticated user with no MFA", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(findUserMfa).mockResolvedValue(null);
    vi.mocked(upsertPendingSecret).mockImplementation(async (_userId, secretEncrypted) =>
      makeMfa({ secretEncrypted })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/setup",
      cookies: { session_token: "valid-session.token" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(upsertPendingSecret).toHaveBeenCalledWith("user-123", expect.any(String));
    await app.close();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      ok: false,
      error: { code: "SESSION_NOT_FOUND" },
    });

    const app = await buildTestApp();
    const response = await app.inject({ method: "POST", url: "/api/auth/mfa/setup" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 409 if MFA is already enabled", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(findUserMfa).mockResolvedValue(makeMfa({ enabledAt: new Date() }));

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/setup",
      cookies: { session_token: "valid-session.token" },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });
});

describe("POST /api/auth/mfa/enable", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("enables MFA and returns recovery codes when the TOTP code is correct", async () => {
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret);
    const code = generateCurrentTotpCode(secret);

    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserMfa).mockResolvedValue(makeMfa({ secretEncrypted, enabledAt: null }));
    vi.mocked(enableMfa).mockImplementation(async (_userId, hashes) =>
      makeMfa({ secretEncrypted, enabledAt: new Date(), recoveryCodesHash: hashes })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/enable",
      cookies: { session_token: "valid-session.token" },
      payload: { code },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("MFA enabled");
    expect(body.recoveryCodes).toHaveLength(10);
    expect(enableMfa).toHaveBeenCalledWith("user-123", expect.any(Array));
    await app.close();
  });

  it("returns 400 for an invalid TOTP code", async () => {
    const secret = generateTotpSecret();
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted: encryptSecret(secret), enabledAt: null })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/enable",
      cookies: { session_token: "valid-session.token" },
      payload: { code: "000000" },
    });

    expect(response.statusCode).toBe(400);
    expect(enableMfa).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 400 when no setup row exists", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserMfa).mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/enable",
      cookies: { session_token: "valid-session.token" },
      payload: { code: "123456" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when the code is not 6 digits", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/enable",
      cookies: { session_token: "valid-session.token" },
      payload: { code: "abc" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/auth/login — MFA branch", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns mfaRequired + mfaToken (no session cookie) when MFA is enabled", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(findUserMfa).mockResolvedValue(makeMfa({ enabledAt: new Date() }));
    vi.mocked(createMfaPendingToken).mockResolvedValue({
      ok: true,
      value: { token: "pending-token-abc", expiresAt: new Date(Date.now() + 300_000) },
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaToken).toBe("pending-token-abc");
    expect(body.user).toBeUndefined();

    expect(createSession).not.toHaveBeenCalled();
    const cookies = response.cookies;
    expect(cookies.find((c) => c.name === "session_token")).toBeUndefined();
    await app.close();
  });

  it("issues a session normally when MFA is not enabled", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(findUserMfa).mockResolvedValue(null);
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      value: {
        session: {
          id: "sess",
          userId: "user-123",
          createdAt: new Date(),
          lastVerifiedAt: new Date(),
        },
        token: "session-token.secret",
      },
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user?.id).toBe("user-123");
    expect(body.mfaRequired).toBeUndefined();
    await app.close();
  });
});

describe("POST /api/auth/login/mfa", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("creates a session when the TOTP code is correct", async () => {
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret);
    const code = generateCurrentTotpCode(secret);

    vi.mocked(consumeMfaPendingToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted, enabledAt: new Date() })
    );
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      value: {
        session: {
          id: "sess",
          userId: "user-123",
          createdAt: new Date(),
          lastVerifiedAt: new Date(),
        },
        token: "session-token.secret",
      },
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login/mfa",
      payload: { mfaToken: "pending-token", code },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user?.id).toBe("user-123");
    const sessionCookie = response.cookies.find((c) => c.name === "session_token");
    expect(sessionCookie?.value).toBe("session-token.secret");
    await app.close();
  });

  it("returns 401 when the pending token is invalid/expired", async () => {
    vi.mocked(consumeMfaPendingToken).mockResolvedValue({
      ok: false,
      error: { code: "TOKEN_NOT_FOUND" },
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login/mfa",
      payload: { mfaToken: "bad", code: "123456" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when the TOTP code is wrong", async () => {
    vi.mocked(consumeMfaPendingToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted: encryptSecret(generateTotpSecret()), enabledAt: new Date() })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login/mfa",
      payload: { mfaToken: "pending", code: "000000" },
    });
    expect(response.statusCode).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("accepts a recovery code and consumes it", async () => {
    const recoveryCode = "abcde-12345";
    const hash = hashRecoveryCode(recoveryCode);

    vi.mocked(consumeMfaPendingToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({
        secretEncrypted: encryptSecret(generateTotpSecret()),
        enabledAt: new Date(),
        recoveryCodesHash: [hash, "other-hash"],
      })
    );
    vi.mocked(consumeRecoveryCodeHash).mockResolvedValue(true);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      value: {
        session: {
          id: "sess",
          userId: "user-123",
          createdAt: new Date(),
          lastVerifiedAt: new Date(),
        },
        token: "session-token.secret",
      },
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login/mfa",
      payload: { mfaToken: "pending", code: recoveryCode },
    });

    expect(response.statusCode).toBe(200);
    expect(consumeRecoveryCodeHash).toHaveBeenCalledWith("user-123", hash);
    await app.close();
  });

  it("rejects an unknown recovery code", async () => {
    vi.mocked(consumeMfaPendingToken).mockResolvedValue({ ok: true, value: "user-123" });
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted: encryptSecret(generateTotpSecret()), enabledAt: new Date() })
    );
    vi.mocked(consumeRecoveryCodeHash).mockResolvedValue(false);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login/mfa",
      payload: { mfaToken: "pending", code: "abcde-12345" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /api/auth/mfa/disable", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("disables MFA when password and TOTP are both valid", async () => {
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret);
    const code = generateCurrentTotpCode(secret);

    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted, enabledAt: new Date() })
    );
    vi.mocked(disableMfa).mockResolvedValue(true);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      cookies: { session_token: "valid-session.token" },
      payload: { password: "password123", code },
    });

    expect(response.statusCode).toBe(200);
    expect(disableMfa).toHaveBeenCalledWith("user-123");
    await app.close();
  });

  it("returns 401 when the password is wrong", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(false);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      cookies: { session_token: "valid-session.token" },
      payload: { password: "wrong", code: "123456" },
    });
    expect(response.statusCode).toBe(401);
    expect(disableMfa).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 401 when the TOTP code is wrong", async () => {
    const secret = generateTotpSecret();
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(findUserMfa).mockResolvedValue(
      makeMfa({ secretEncrypted: encryptSecret(secret), enabledAt: new Date() })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      cookies: { session_token: "valid-session.token" },
      payload: { password: "password123", code: "000000" },
    });
    expect(response.statusCode).toBe(401);
    expect(disableMfa).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 400 when MFA is not enabled", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(mockValidSession);
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(findUserMfa).mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/mfa/disable",
      cookies: { session_token: "valid-session.token" },
      payload: { password: "password123", code: "123456" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
