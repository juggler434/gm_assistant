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

// Import mocked modules
import { findUserByEmail, createUser } from "@/modules/auth/repository.js";
import {
  createSession,
  validateSessionToken,
} from "@/modules/auth/session.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

describe("Full Authentication Flow", () => {
  const mockUser: User = {
    id: "user-abc-123",
    email: "player@example.com",
    passwordHash: "argon2-hashed-password",
    name: "Test Player",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
  };

  const mockSessionResult = {
    ok: true as const,
    value: {
      session: {
        id: "session-xyz-789",
        userId: "user-abc-123",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastVerifiedAt: new Date("2025-01-01T00:00:00Z"),
      },
      token: "abcdefghijkmnpqrstuvwx.yz234567890abcdefghijkm",
    },
  };

  const mockValidatedSession = {
    ok: true as const,
    value: {
      id: "session-xyz-789",
      userId: "user-abc-123",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastVerifiedAt: new Date("2025-01-01T00:00:00Z"),
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

  function getAuthCookie(token?: string) {
    return `session_token=${token ?? mockSessionResult.value.token}`;
  }

  describe("Registration creates user and session", () => {
    it("should register a new user, create a session, and return user data with session cookie", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(null);
      vi.mocked(argon2.hash).mockResolvedValue("argon2-hashed-password");
      vi.mocked(createUser).mockResolvedValue(mockUser);
      vi.mocked(createSession).mockResolvedValue(mockSessionResult);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "player@example.com",
          password: "securepass123",
          name: "Test Player",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.user).toEqual({
        id: "user-abc-123",
        email: "player@example.com",
        name: "Test Player",
      });

      // Verify password was hashed before storage
      expect(argon2.hash).toHaveBeenCalledWith("securepass123");
      expect(createUser).toHaveBeenCalledWith({
        email: "player@example.com",
        passwordHash: "argon2-hashed-password",
        name: "Test Player",
      });

      // Verify session was created for the new user
      expect(createSession).toHaveBeenCalledWith("user-abc-123");

      // Verify session cookie is set
      const sessionCookie = response.cookies.find(
        (c) => c.name === "session_token"
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBe(mockSessionResult.value.token);
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.path).toBe("/");

      await app.close();
    });

    it("should allow the registered user to access protected routes with the session cookie", async () => {
      // Step 1: Register
      vi.mocked(findUserByEmail).mockResolvedValue(null);
      vi.mocked(argon2.hash).mockResolvedValue("argon2-hashed-password");
      vi.mocked(createUser).mockResolvedValue(mockUser);
      vi.mocked(createSession).mockResolvedValue(mockSessionResult);

      const app = await buildTestApp();

      const registerResponse = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "player@example.com",
          password: "securepass123",
          name: "Test Player",
        },
      });

      expect(registerResponse.statusCode).toBe(201);

      // Extract the session token from registration response
      const sessionCookie = registerResponse.cookies.find(
        (c) => c.name === "session_token"
      );
      const token = sessionCookie!.value;

      // Step 2: Use the token to access a protected route
      vi.mocked(validateSessionToken).mockResolvedValue(mockValidatedSession);

      const protectedResponse = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: `session_token=${token}` },
      });

      // Should not get 401 - session is valid
      expect(protectedResponse.statusCode).not.toBe(401);
      expect(validateSessionToken).toHaveBeenCalledWith(token);

      await app.close();
    });

    it("should reject registration with duplicate email", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "player@example.com",
          password: "securepass123",
          name: "Test Player",
        },
      });

      expect(response.statusCode).toBe(409);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Conflict");
      expect(body.message).toBe("Email already registered");

      // Should not attempt to hash or create user
      expect(argon2.hash).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();

      // Should not set session cookie
      const sessionCookie = response.cookies.find(
        (c) => c.name === "session_token"
      );
      expect(sessionCookie).toBeUndefined();

      await app.close();
    });
  });

  describe("Login with valid credentials", () => {
    it("should authenticate user and return session cookie", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(createSession).mockResolvedValue(mockSessionResult);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "securepass123",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.user).toEqual({
        id: "user-abc-123",
        email: "player@example.com",
        name: "Test Player",
      });

      // Verify password was verified against stored hash
      expect(argon2.verify).toHaveBeenCalledWith(
        "argon2-hashed-password",
        "securepass123"
      );

      // Verify session was created
      expect(createSession).toHaveBeenCalledWith("user-abc-123");

      // Verify session cookie is set
      const sessionCookie = response.cookies.find(
        (c) => c.name === "session_token"
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBe(mockSessionResult.value.token);
      expect(sessionCookie?.httpOnly).toBe(true);

      await app.close();
    });

    it("should allow access to protected routes after login", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(createSession).mockResolvedValue(mockSessionResult);

      const app = await buildTestApp();

      // Step 1: Login
      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "securepass123",
        },
      });

      expect(loginResponse.statusCode).toBe(200);

      const sessionCookie = loginResponse.cookies.find(
        (c) => c.name === "session_token"
      );
      const token = sessionCookie!.value;

      // Step 2: Access protected route with the session token
      vi.mocked(validateSessionToken).mockResolvedValue(mockValidatedSession);

      const protectedResponse = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: `session_token=${token}` },
      });

      expect(protectedResponse.statusCode).not.toBe(401);
      expect(validateSessionToken).toHaveBeenCalledWith(token);

      await app.close();
    });

    it("should not expose password hash in login response", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(createSession).mockResolvedValue(mockSessionResult);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "securepass123",
        },
      });

      const body = JSON.parse(response.body);
      expect(body.user.passwordHash).toBeUndefined();
      expect(body.user.password).toBeUndefined();

      await app.close();
    });
  });

  describe("Login with invalid credentials", () => {
    it("should reject login with non-existent email", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(null);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nobody@example.com",
          password: "securepass123",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid credentials");

      // Should not attempt password verification or session creation
      expect(argon2.verify).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();

      // Should not set session cookie
      const sessionCookie = response.cookies.find(
        (c) => c.name === "session_token"
      );
      expect(sessionCookie).toBeUndefined();

      await app.close();
    });

    it("should reject login with wrong password", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(false);

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
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

    it("should return identical error for wrong email and wrong password (prevent enumeration)", async () => {
      const app = await buildTestApp();

      // Attempt with non-existent email
      vi.mocked(findUserByEmail).mockResolvedValue(null);

      const nonExistentResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nobody@example.com",
          password: "securepass123",
        },
      });

      // Attempt with wrong password
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(false);

      const wrongPasswordResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "wrongpassword",
        },
      });

      const body1 = JSON.parse(nonExistentResponse.body);
      const body2 = JSON.parse(wrongPasswordResponse.body);

      // Both responses must be indistinguishable
      expect(nonExistentResponse.statusCode).toBe(
        wrongPasswordResponse.statusCode
      );
      expect(body1.error).toBe(body2.error);
      expect(body1.message).toBe(body2.message);

      await app.close();
    });

    it("should reject login with invalid email format", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "not-an-email",
          password: "securepass123",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

      // Should not attempt any auth operations
      expect(findUserByEmail).not.toHaveBeenCalled();

      await app.close();
    });

    it("should reject login with missing password", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Request");

      await app.close();
    });

    it("should reject login with empty body", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("Protected routes reject unauthenticated requests", () => {
    it("should return 401 when no session cookie is provided", async () => {
      // No cookie means no token for validation
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN_FORMAT" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        // No cookie header
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should return 401 when session token is invalid", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN_FORMAT" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: "session_token=garbage-token" },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should return 401 when session is not found in store", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should return 401 when session secret does not match", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_SECRET" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should reject unauthenticated POST to protected routes", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: { name: "New Campaign" },
        // No cookie
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should reject unauthenticated DELETE to protected routes", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "DELETE",
        url: "/api/campaigns/123e4567-e89b-12d3-a456-426614174000",
        // No cookie
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should reject unauthenticated PATCH to protected routes", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "PATCH",
        url: "/api/campaigns/123e4567-e89b-12d3-a456-426614174000",
        payload: { name: "Updated" },
        // No cookie
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("should allow access to health endpoint without authentication", async () => {
      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/health",
        // No cookie
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");

      await app.close();
    });

    it("should allow access to auth endpoints without authentication", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(null);

      const app = await buildTestApp();

      // Login endpoint should be accessible (returns 401 for bad creds, not for being unauthenticated)
      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "securepass123",
        },
      });

      // Should get 401 "Invalid credentials", not "Authentication required"
      expect(loginResponse.statusCode).toBe(401);

      const body = JSON.parse(loginResponse.body);
      expect(body.message).toBe("Invalid credentials");

      await app.close();
    });
  });

  describe("Session expiry handled", () => {
    it("should reject requests when session has expired (not found in Redis)", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should reject requests when session validation encounters a database error", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "DATABASE_ERROR", cause: new Error("Redis connection lost") },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie() },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });

    it("should allow re-login after session expiry", async () => {
      const app = await buildTestApp();

      // Step 1: Attempt to access protected route with expired session
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "SESSION_NOT_FOUND" },
      });

      const expiredResponse = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: getAuthCookie("old-expired-token.secret123456789") },
      });

      expect(expiredResponse.statusCode).toBe(401);

      // Step 2: Login again to get a new session
      vi.mocked(findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);

      const newSessionResult = {
        ok: true as const,
        value: {
          session: {
            id: "new-session-456",
            userId: "user-abc-123",
            createdAt: new Date(),
            lastVerifiedAt: new Date(),
          },
          token: "newsessiontokenvalue1234.newsecretvaluefortest12",
        },
      };
      vi.mocked(createSession).mockResolvedValue(newSessionResult);

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "player@example.com",
          password: "securepass123",
        },
      });

      expect(loginResponse.statusCode).toBe(200);

      // Extract new session token
      const newCookie = loginResponse.cookies.find(
        (c) => c.name === "session_token"
      );
      expect(newCookie).toBeDefined();
      const newToken = newCookie!.value;

      // Step 3: Access protected route with the new session
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: true,
        value: {
          id: "new-session-456",
          userId: "user-abc-123",
          createdAt: new Date(),
          lastVerifiedAt: new Date(),
        },
      });

      const protectedResponse = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: `session_token=${newToken}` },
      });

      expect(protectedResponse.statusCode).not.toBe(401);
      expect(validateSessionToken).toHaveBeenCalledWith(newToken);

      await app.close();
    });

    it("should handle session with tampered secret", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_SECRET" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: {
          cookie: "session_token=validsessionid12345678.tampered_secret_value12",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");

      await app.close();
    });

    it("should handle malformed session tokens gracefully", async () => {
      vi.mocked(validateSessionToken).mockResolvedValue({
        ok: false,
        error: { code: "INVALID_TOKEN_FORMAT" },
      });

      const app = await buildTestApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: "session_token=not-a-valid-token-format" },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Authentication required");

      await app.close();
    });
  });
});
