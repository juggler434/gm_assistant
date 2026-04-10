// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Password reset token store.
 *
 * Single-use bearer tokens delivered via email for password resets.
 * Same security model as email verification tokens: only a SHA-256
 * hash is stored in Redis with a TTL (default 1h). Tokens are
 * consumed atomically so a link cannot be replayed.
 */

import { randomBytes, createHash } from "node:crypto";
import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

const TOKEN_KEY_PREFIX = "pwd-reset:";
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour
const TOKEN_BYTES = 32; // 256 bits of entropy

export type PasswordResetError =
  | { code: "TOKEN_NOT_FOUND" }
  | { code: "DATABASE_ERROR"; cause: unknown };

export interface PasswordResetToken {
  /** The raw token to embed in the reset URL. */
  token: string;
  /** When the token will expire (informational, used in emails). */
  expiresAt: Date;
}

/** Lazy-initialized Redis connection. */
let resetRedis: RedisType | null = null;

function getRedis(): RedisType {
  if (!resetRedis) {
    resetRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return resetRedis;
}

/**
 * Override the Redis connection used by this module. Test-only escape hatch.
 */
export function __setPasswordResetRedisForTests(redis: RedisType | null): void {
  resetRedis = redis;
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
 * Create a single-use password reset token for a user and store its hash in Redis.
 */
export async function createPasswordResetToken(
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<Result<PasswordResetToken, PasswordResetError>> {
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
 * Look up the user ID associated with a password reset token without consuming it.
 * Used by tests; production code should use {@link consumePasswordResetToken}.
 */
export async function peekPasswordResetToken(
  token: string
): Promise<Result<string, PasswordResetError>> {
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
 * Consume a password reset token: atomically read and delete it.
 * Returns the user ID the token belongs to, or TOKEN_NOT_FOUND if missing/expired.
 */
export async function consumePasswordResetToken(
  token: string
): Promise<Result<string, PasswordResetError>> {
  try {
    const redis = getRedis();
    const key = keyFor(token);
    // Atomic get-and-delete via Lua (works on Redis < 6.2 which lacks GETDEL).
    const userId = (await redis.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v;",
      1,
      key,
    )) as string | null;
    if (!userId) {
      return err({ code: "TOKEN_NOT_FOUND" });
    }
    return ok(userId);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

export const PASSWORD_RESET_TTL_SECONDS = DEFAULT_TTL_SECONDS;
