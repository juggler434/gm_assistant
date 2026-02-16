import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerBodySchema } from "@/modules/auth/schemas.js";

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
import { findUserByEmail, createUser } from "@/modules/auth/repository.js";
import { createSession } from "@/modules/auth/session.js";
import * as argon2 from "argon2";
import type { User } from "@/db/schema/index.js";

describe("Register Schema Validation", () => {
  describe("registerBodySchema", () => {
    it("should accept valid email, password, and name", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
        expect(result.data.password).toBe("password123");
        expect(result.data.name).toBe("Test User");
      }
    });

    it("should reject invalid email format", () => {
      const result = registerBodySchema.safeParse({
        email: "not-an-email",
        password: "password123",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty email", () => {
      const result = registerBodySchema.safeParse({
        email: "",
        password: "password123",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty password", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should reject password shorter than 8 characters", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "short",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should accept password with exactly 8 characters", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "exactly8",
        name: "Test User",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty name", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
        name: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject name longer than 255 characters", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
        name: "a".repeat(256),
      });

      expect(result.success).toBe(false);
    });

    it("should accept name with exactly 255 characters", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
        name: "a".repeat(255),
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing email", () => {
      const result = registerBodySchema.safeParse({
        password: "password123",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing password", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        name: "Test User",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing name", () => {
      const result = registerBodySchema.safeParse({
        email: "test@example.com",
        password: "password123",
      });

      expect(result.success).toBe(false);
    });
  });
});

describe("Register Route Handler", () => {
  const mockNewUser: User = {
    id: "user-123",
    email: "newuser@example.com",
    passwordHash: "hashed-password",
    name: "New User",
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

  it("should return 201 and user data on successful registration", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue(mockNewUser);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.user).toEqual({
      id: "user-123",
      email: "newuser@example.com",
      name: "New User",
    });

    // Verify session cookie is set
    const cookies = response.cookies;
    const sessionCookie = cookies.find((c) => c.name === "session_token");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toBe("session-token.secret");

    await app.close();
  });

  it("should return 409 when email already exists", async () => {
    const existingUser: User = {
      id: "existing-user",
      email: "existing@example.com",
      passwordHash: "hashed-password",
      name: "Existing User",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "existing@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(response.statusCode).toBe(409);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Conflict");
    expect(body.message).toBe("Email already registered");

    // Should not attempt to hash password or create user
    expect(argon2.hash).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();

    await app.close();
  });

  it("should return 400 for invalid email format", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "not-an-email",
        password: "password123",
        name: "Test User",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 400 for password shorter than 8 characters", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "test@example.com",
        password: "short",
        name: "Test User",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 400 for missing name", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 400 for empty name", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "test@example.com",
        password: "password123",
        name: "",
      },
    });

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Bad Request");

    await app.close();
  });

  it("should return 500 when user creation fails", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue(null);

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("Failed to create user");

    // Should not attempt to create session
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it("should return 500 when session creation fails", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue(mockNewUser);
    vi.mocked(createSession).mockResolvedValue({
      ok: false,
      error: { code: "DATABASE_ERROR", cause: new Error("Redis down") },
    });

    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("Failed to create session");

    await app.close();
  });

  it("should hash password with argon2 before storing", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password-result");
    vi.mocked(createUser).mockResolvedValue(mockNewUser);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(argon2.hash).toHaveBeenCalledWith("password123");
    expect(createUser).toHaveBeenCalledWith({
      email: "newuser@example.com",
      passwordHash: "hashed-password-result",
      name: "New User",
    });

    await app.close();
  });

  it("should create session with new user ID on successful registration", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue(mockNewUser);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(createSession).toHaveBeenCalledWith("user-123");

    await app.close();
  });

  it("should check if email exists before creating user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue(mockNewUser);
    vi.mocked(createSession).mockResolvedValue(mockSessionResult);

    const app = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(findUserByEmail).toHaveBeenCalledWith("newuser@example.com");

    await app.close();
  });
});
