// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Email verification token store.
 *
 * Verification tokens are single-use bearer tokens delivered via email.
 * We never persist them in plaintext: only a SHA-256 hash is stored in
 * Redis with a TTL (default 24h). Tokens are deleted as soon as they are
 * consumed by GET /verify-email so the link cannot be replayed.
 */

import { randomBytes, createHash } from "node:crypto";
import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

const TOKEN_KEY_PREFIX = "email-verify:";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const TOKEN_BYTES = 32; // 256 bits of entropy

export type EmailVerificationError =
  | { code: "TOKEN_NOT_FOUND" }
  | { code: "DATABASE_ERROR"; cause: unknown };

export interface EmailVerificationToken {
  /** The raw token to embed in the verification URL. */
  token: string;
  /** When the token will expire (informational, used in emails). */
  expiresAt: Date;
}

/** Lazy-initialized Redis connection. */
let verificationRedis: RedisType | null = null;

function getRedis(): RedisType {
  if (!verificationRedis) {
    verificationRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return verificationRedis;
}

/**
 * Override the Redis connection used by this module. Test-only escape hatch.
 */
export function __setVerificationRedisForTests(redis: RedisType | null): void {
  verificationRedis = redis;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function keyFor(token: string): string {
  return `${TOKEN_KEY_PREFIX}${hashToken(token)}`;
}

function generateRawToken(): string {
  // URL-safe base64 (no padding) so the token can go straight into a query string.
  return randomBytes(TOKEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a single-use verification token for a user and store its hash in Redis.
 */
export async function createVerificationToken(
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<Result<EmailVerificationToken, EmailVerificationError>> {
  try {
    const token = generateRawToken();
    const redis = getRedis();
    await redis.set(keyFor(token), userId, "EX", ttlSeconds);
    return ok({
      token,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Look up the user ID associated with a verification token without consuming it.
 * Used by tests; production code should use {@link consumeVerificationToken}.
 */
export async function peekVerificationToken(
  token: string
): Promise<Result<string, EmailVerificationError>> {
  try {
    const redis = getRedis();
    const userId = await redis.get(keyFor(token));
    if (!userId) {
      return err({ code: "TOKEN_NOT_FOUND" });
    }
    return ok(userId);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Consume a verification token: atomically read and delete it.
 * Returns the user ID the token belongs to, or TOKEN_NOT_FOUND if missing/expired.
 */
export async function consumeVerificationToken(
  token: string
): Promise<Result<string, EmailVerificationError>> {
  try {
    const redis = getRedis();
    const key = keyFor(token);
    // Atomic get-and-delete via Lua (works on Redis < 6.2 which lacks GETDEL).
    const userId = await redis.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v;",
      1,
      key,
    ) as string | null;
    if (!userId) {
      return err({ code: "TOKEN_NOT_FOUND" });
    }
    return ok(userId);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/**
 * Delete any outstanding verification tokens for a user. Best-effort: callers
 * should not depend on this completing for correctness, since tokens are
 * single-use anyway.
 *
 * NOTE: tokens are keyed by hash, so we cannot enumerate a user's tokens
 * without storing a reverse index. We instead rely on the natural TTL plus
 * single-use semantics; this function exists as a hook for tests.
 */
export const VERIFICATION_TOKEN_TTL_SECONDS = DEFAULT_TTL_SECONDS;
