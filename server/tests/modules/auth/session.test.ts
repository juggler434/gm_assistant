import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  parseSessionToken,
} from "@/modules/auth/session.js";

describe("Session Token Generation", () => {
  it("should generate a valid session token", () => {
    const result = generateSessionToken();

    expect(result.sessionId).toBeDefined();
    expect(result.secret).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.token).toBe(`${result.sessionId}.${result.secret}`);
  });

  it("should generate unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = generateSessionToken();
      expect(tokens.has(result.token)).toBe(false);
      tokens.add(result.token);
    }
  });

  it("should generate tokens with correct length", () => {
    const result = generateSessionToken();

    // 24 characters for session ID + 1 for dot + 24 for secret = 49 total
    expect(result.token.length).toBe(49);
    expect(result.sessionId.length).toBe(24);
    expect(result.secret.length).toBe(24);
  });

  it("should only use allowed characters", () => {
    const allowedChars = /^[abcdefghijkmnpqrstuvwxyz23456789]+$/;

    for (let i = 0; i < 10; i++) {
      const result = generateSessionToken();
      expect(result.sessionId).toMatch(allowedChars);
      expect(result.secret).toMatch(allowedChars);
    }
  });
});

describe("Session Token Parsing", () => {
  it("should parse a valid token", () => {
    const { token, sessionId, secret } = generateSessionToken();
    const result = parseSessionToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionId).toBe(sessionId);
      expect(result.value.secret).toBe(secret);
    }
  });

  it("should reject token without separator", () => {
    const result = parseSessionToken("invalidsessiontoken");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TOKEN_FORMAT");
    }
  });

  it("should reject token with empty session ID", () => {
    const result = parseSessionToken(".secret");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TOKEN_FORMAT");
    }
  });

  it("should reject token with empty secret", () => {
    const result = parseSessionToken("sessionid.");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TOKEN_FORMAT");
    }
  });

  it("should reject empty string", () => {
    const result = parseSessionToken("");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TOKEN_FORMAT");
    }
  });

  it("should handle token with multiple dots", () => {
    // The parser should only split on the first dot
    const result = parseSessionToken("session.secret.extra");

    // This should fail because we expect exactly 2 parts
    expect(result.ok).toBe(false);
  });
});
