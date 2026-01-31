import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db/index.js";
import { sessions } from "@/db/schema/index.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

/** Session token format: <sessionId>.<sessionSecret> */
export interface SessionToken {
  sessionId: string;
  secret: string;
  token: string;
}

/** Session with associated user ID */
export interface ValidatedSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastVerifiedAt: Date;
}

/** Error types for session operations */
export type SessionError =
  | { code: "INVALID_TOKEN_FORMAT" }
  | { code: "SESSION_NOT_FOUND" }
  | { code: "SESSION_EXPIRED" }
  | { code: "INVALID_SECRET" }
  | { code: "DATABASE_ERROR"; cause: unknown };

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const SESSION_ID_LENGTH = 24;
const SECRET_LENGTH = 24;

/**
 * Generate a cryptographically secure random string using a human-readable alphabet.
 * Uses 5 bits per character for 120+ bits of entropy with 24 characters.
 */
function generateSecureRandomString(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    // Use 5 bits per byte to index into 32-character alphabet
    result += ALPHABET[bytes[i]! >> 3];
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
    const { sessionId, secret, token } = generateSessionToken();
    const secretHash = hashSecret(secret).toString("hex");
    const now = new Date();

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      secretHash,
      createdAt: now,
      lastVerifiedAt: now,
    });

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
 * Implements inactivity timeout and periodic lastVerifiedAt updates.
 */
export async function validateSessionToken(token: string): Promise<Result<ValidatedSession, SessionError>> {
  const parseResult = parseSessionToken(token);
  if (!parseResult.ok) {
    return parseResult;
  }

  const { sessionId, secret } = parseResult.value;

  try {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return err({ code: "SESSION_NOT_FOUND" });
    }

    // Verify the secret using constant-time comparison
    const providedHash = hashSecret(secret);
    const storedHash = Buffer.from(session.secretHash, "hex");

    if (!constantTimeEqual(providedHash, storedHash)) {
      return err({ code: "INVALID_SECRET" });
    }

    // Check for inactivity timeout
    const now = new Date();
    const maxAgeMs = config.session.maxAgeDays * 24 * 60 * 60 * 1000;
    const lastVerifiedAt = new Date(session.lastVerifiedAt);

    if (now.getTime() - lastVerifiedAt.getTime() > maxAgeMs) {
      // Session has expired due to inactivity
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return err({ code: "SESSION_EXPIRED" });
    }

    // Update lastVerifiedAt if enough time has passed (reduces DB writes)
    const updateAgeMs = config.session.updateAgeHours * 60 * 60 * 1000;
    if (now.getTime() - lastVerifiedAt.getTime() > updateAgeMs) {
      await db
        .update(sessions)
        .set({ lastVerifiedAt: now })
        .where(eq(sessions.id, sessionId));
    }

    return ok({
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      lastVerifiedAt: now, // Return the current time since we just verified
    });
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Invalidate a session by deleting it from the database.
 */
export async function invalidateSession(sessionId: string): Promise<Result<void, SessionError>> {
  try {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return ok(undefined);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Invalidate all sessions for a user.
 */
export async function invalidateAllUserSessions(userId: string): Promise<Result<void, SessionError>> {
  try {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return ok(undefined);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Clean up expired sessions from the database.
 * Should be run periodically (e.g., via a cron job or background worker).
 */
export async function cleanupExpiredSessions(): Promise<Result<number, SessionError>> {
  try {
    const maxAgeMs = config.session.maxAgeDays * 24 * 60 * 60 * 1000;
    const expirationDate = new Date(Date.now() - maxAgeMs);

    const result = await db
      .delete(sessions)
      .where(lt(sessions.lastVerifiedAt, expirationDate))
      .returning({ id: sessions.id });

    return ok(result.length);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}
