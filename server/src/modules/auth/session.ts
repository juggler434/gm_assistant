import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";
import type { SessionToken, ValidatedSession, SessionError } from "./types.js";

const ALLOWED_CHARACTERS = "abcdefghijkmnpqrstuvwxyz23456789";
const SESSION_ID_LENGTH = 24;
const SECRET_LENGTH = 24;
const SESSION_KEY_PREFIX = "session:";

/** Session data stored in Redis */
interface StoredSession {
  userId: string;
  secretHash: string;
  createdAt: string;
}

/** Lazy-initialized Redis connection for sessions */
let sessionRedis: RedisType | null = null;

function getSessionRedis(): RedisType {
  if (!sessionRedis) {
    sessionRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return sessionRedis;
}

/**
 * Generate a cryptographically secure random string using a human-readable alphabet.
 * Uses 5 bits per character for 120+ bits of entropy with 24 characters.
 */
function generateSecureRandomString(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    // Use 5 bits per byte to index into 32-character alphabet
    result += ALLOWED_CHARACTERS[bytes[i]! >> 3];
  }
  return result;
}

/**
 * Hash a secret using SHA-256.
 */
function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Constant-time comparison of two buffers.
 */
function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Get session TTL in seconds.
 */
function getSessionTtlSeconds(): number {
  return config.session.maxAgeDays * 24 * 60 * 60;
}

/**
 * Generate a new session token.
 */
export function generateSessionToken(): SessionToken {
  const sessionId = generateSecureRandomString(SESSION_ID_LENGTH);
  const secret = generateSecureRandomString(SECRET_LENGTH);
  const token = `${sessionId}.${secret}`;
  return { sessionId, secret, token };
}

/**
 * Parse a session token string into its components.
 */
export function parseSessionToken(token: string): Result<{ sessionId: string; secret: string }, SessionError> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return err({ code: "INVALID_TOKEN_FORMAT" });
  }
  return ok({ sessionId: parts[0], secret: parts[1] });
}

/**
 * Create a new session for a user.
 */
export async function createSession(userId: string): Promise<Result<{ session: ValidatedSession; token: string }, SessionError>> {
  try {
    const redis = getSessionRedis();
    const { sessionId, secret, token } = generateSessionToken();
    const secretHash = hashSecret(secret).toString("hex");
    const now = new Date();

    const sessionData: StoredSession = {
      userId,
      secretHash,
      createdAt: now.toISOString(),
    };

    await redis.set(
      `${SESSION_KEY_PREFIX}${sessionId}`,
      JSON.stringify(sessionData),
      "EX",
      getSessionTtlSeconds()
    );

    return ok({
      session: {
        id: sessionId,
        userId,
        createdAt: now,
        lastVerifiedAt: now,
      },
      token,
    });
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Validate a session token and return the session if valid.
 * Implements sliding expiration by refreshing TTL on each validation.
 */
export async function validateSessionToken(token: string): Promise<Result<ValidatedSession, SessionError>> {
  const parseResult = parseSessionToken(token);
  if (!parseResult.ok) {
    return parseResult;
  }

  const { sessionId, secret } = parseResult.value;

  try {
    const redis = getSessionRedis();
    const key = `${SESSION_KEY_PREFIX}${sessionId}`;
    const data = await redis.get(key);

    if (!data) {
      return err({ code: "SESSION_NOT_FOUND" });
    }

    const session: StoredSession = JSON.parse(data);

    // Verify the secret using constant-time comparison
    const providedHash = hashSecret(secret);
    const storedHash = Buffer.from(session.secretHash, "hex");

    if (!constantTimeEqual(providedHash, storedHash)) {
      return err({ code: "INVALID_SECRET" });
    }

    // Refresh TTL (sliding expiration)
    await redis.expire(key, getSessionTtlSeconds());

    const now = new Date();
    return ok({
      id: sessionId,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      lastVerifiedAt: now,
    });
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Invalidate a session by deleting it from Redis.
 */
export async function invalidateSession(sessionId: string): Promise<Result<void, SessionError>> {
  try {
    const redis = getSessionRedis();
    await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`);
    return ok(undefined);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Invalidate all sessions for a user.
 * Uses SCAN to find matching keys without blocking Redis.
 */
export async function invalidateAllUserSessions(userId: string): Promise<Result<void, SessionError>> {
  try {
    const redis = getSessionRedis();
    let cursor = "0";
    const keysToDelete: string[] = [];

    // Use SCAN to iterate through all session keys
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${SESSION_KEY_PREFIX}*`,
        "COUNT",
        100
      );
      cursor = nextCursor;

      // Check each key to see if it belongs to the user
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const session: StoredSession = JSON.parse(data);
          if (session.userId === userId) {
            keysToDelete.push(key);
          }
        }
      }
    } while (cursor !== "0");

    // Delete all matching keys
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    return ok(undefined);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}
