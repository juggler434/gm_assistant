// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock dependencies before importing the app ---

vi.mock("@/modules/auth/repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  findAuthIdentity: vi.fn(),
  createAuthIdentity: vi.fn(),
  createOAuthUser: vi.fn(),
  markEmailVerified: vi.fn(),
  updatePassword: vi.fn(),
  isEmailVerified: vi.fn(),
}));

vi.mock("@/modules/auth/session.js", () => ({
  createSession: vi.fn(),
  validateSessionToken: vi.fn(),
  invalidateSession: vi.fn(),
  invalidateAllUserSessions: vi.fn(),
}));

vi.mock("@/modules/auth/google-oauth.js", async () => {
  const actual =
    await vi.importActual<typeof import("@/modules/auth/google-oauth.js")>(
      "@/modules/auth/google-oauth.js"
    );
  return {
    ...actual,
    getGoogleOAuthConfig: vi.fn(),
    createAuthorizationUrl: vi.fn(),
    consumeState: vi.fn(),
    exchangeCodeForUserInfo: vi.fn(),
  };
});

vi.mock("@/modules/auth/audit-log.js", () => ({
  recordAuthEvent: vi.fn(),
  purgeOldAuthEvents: vi.fn(),
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

vi.mock("@/services/email/factory.js", () => ({
  getEmailService: vi.fn(() => ({
    sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    sendDuplicateRegistrationEmail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    providerName: "log",
  })),
  createEmailService: vi.fn(),
  __resetEmailServiceForTests: vi.fn(),
}));

import {
  findUserByEmail,
  findAuthIdentity,
  createAuthIdentity,
  createOAuthUser,
} from "@/modules/auth/repository.js";
import { createSession } from "@/modules/auth/session.js";
import {
  getGoogleOAuthConfig,
  createAuthorizationUrl,
  consumeState,
  exchangeCodeForUserInfo,
} from "@/modules/auth/google-oauth.js";
import type { User, AuthIdentity } from "@/db/schema/index.js";

const VALID_OAUTH_CONFIG = {
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "http://localhost:3000/api/auth/google/callback",
};

const GOOGLE_USER = {
  sub: "google-sub-abc123",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
};

const SUCCESSFUL_SESSION = {
  ok: true as const,
  value: {
    session: {
      id: "session-id",
      userId: "user-1",
      createdAt: new Date(),
      lastVerifiedAt: new Date(),
    },
    token: "session-id.secret",
  },
};

async function buildTestApp() {
  const { buildApp } = await import("@/app.js");
  return buildApp({ logger: false });
}

describe("Google OAuth start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when Google OAuth is not configured", async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue(null);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/google/start" });

    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it("redirects to Google when configured", async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue(VALID_OAUTH_CONFIG);
    vi.mocked(createAuthorizationUrl).mockResolvedValue({
      ok: true,
      value: {
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=abc",
        state: "abc",
      },
    });

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/google/start" });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
    );
    await app.close();
  });
});

describe("Google OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGoogleOAuthConfig).mockReturnValue(VALID_OAUTH_CONFIG);
  });

  it("redirects to login with invalid_state when state is unknown", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: false,
      error: { code: "STATE_NOT_FOUND" },
    });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=bad",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("oauth_error=invalid_state");
    expect(exchangeCodeForUserInfo).not.toHaveBeenCalled();
    await app.close();
  });

  it("redirects with access_denied when Google returns an error", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?error=access_denied&state=abc",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("oauth_error=access_denied");
    expect(consumeState).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates a new OAuth user when no existing account + no identity", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: true,
      value: { codeVerifier: "verifier" },
    });
    vi.mocked(exchangeCodeForUserInfo).mockResolvedValue({
      ok: true,
      value: GOOGLE_USER,
    });
    vi.mocked(findAuthIdentity).mockResolvedValue(null);
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const newUser: User = {
      id: "user-new",
      email: GOOGLE_USER.email,
      passwordHash: null,
      name: GOOGLE_USER.name,
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(createOAuthUser).mockResolvedValue(newUser);
    vi.mocked(createSession).mockResolvedValue(SUCCESSFUL_SESSION);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=s",
    });

    expect(res.statusCode).toBe(302);
    expect(createOAuthUser).toHaveBeenCalledWith({
      email: GOOGLE_USER.email,
      name: GOOGLE_USER.name,
      provider: "google",
      providerAccountId: GOOGLE_USER.sub,
    });
    expect(createSession).toHaveBeenCalledWith(newUser.id);
    const cookie = res.cookies.find((c) => c.name === "session_token");
    expect(cookie?.value).toBe("session-id.secret");
    await app.close();
  });

  it("links Google to an existing verified account with the same email", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: true,
      value: { codeVerifier: "verifier" },
    });
    vi.mocked(exchangeCodeForUserInfo).mockResolvedValue({
      ok: true,
      value: GOOGLE_USER,
    });
    vi.mocked(findAuthIdentity).mockResolvedValue(null);
    const existingUser: User = {
      id: "user-existing",
      email: GOOGLE_USER.email,
      passwordHash: "argon2-hash",
      name: "Alice (password account)",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser);
    const identity: AuthIdentity = {
      id: "identity-new",
      userId: existingUser.id,
      provider: "google",
      providerAccountId: GOOGLE_USER.sub,
      createdAt: new Date(),
    };
    vi.mocked(createAuthIdentity).mockResolvedValue(identity);
    vi.mocked(createSession).mockResolvedValue(SUCCESSFUL_SESSION);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=s",
    });

    expect(res.statusCode).toBe(302);
    expect(createAuthIdentity).toHaveBeenCalledWith(
      existingUser.id,
      "google",
      GOOGLE_USER.sub
    );
    expect(createOAuthUser).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith(existingUser.id);
    await app.close();
  });

  it("refuses to link Google to an unverified existing account", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: true,
      value: { codeVerifier: "verifier" },
    });
    vi.mocked(exchangeCodeForUserInfo).mockResolvedValue({
      ok: true,
      value: GOOGLE_USER,
    });
    vi.mocked(findAuthIdentity).mockResolvedValue(null);
    const unverifiedUser: User = {
      id: "user-unverified",
      email: GOOGLE_USER.email,
      passwordHash: "argon2-hash",
      name: "Alice (unverified)",
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=s",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("oauth_error=account_not_linkable");
    expect(createAuthIdentity).not.toHaveBeenCalled();
    expect(createOAuthUser).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("logs in a user who already has a Google identity", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: true,
      value: { codeVerifier: "verifier" },
    });
    vi.mocked(exchangeCodeForUserInfo).mockResolvedValue({
      ok: true,
      value: GOOGLE_USER,
    });
    const existingIdentity: AuthIdentity = {
      id: "identity-existing",
      userId: "user-existing",
      provider: "google",
      providerAccountId: GOOGLE_USER.sub,
      createdAt: new Date(),
    };
    vi.mocked(findAuthIdentity).mockResolvedValue(existingIdentity);
    vi.mocked(createSession).mockResolvedValue(SUCCESSFUL_SESSION);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=s",
    });

    expect(res.statusCode).toBe(302);
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(createOAuthUser).not.toHaveBeenCalled();
    expect(createAuthIdentity).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith("user-existing");
    await app.close();
  });

  it("rejects an unverified Google email", async () => {
    vi.mocked(consumeState).mockResolvedValue({
      ok: true,
      value: { codeVerifier: "verifier" },
    });
    vi.mocked(exchangeCodeForUserInfo).mockResolvedValue({
      ok: true,
      value: { ...GOOGLE_USER, emailVerified: false },
    });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c&state=s",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("oauth_error=email_not_verified");
    expect(findAuthIdentity).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("Google OAuth config endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns enabled=true when configured", async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue(VALID_OAUTH_CONFIG);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/google/config" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enabled: true });
    await app.close();
  });

  it("returns enabled=false when not configured", async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue(null);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/google/config" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enabled: false });
    await app.close();
  });
});
