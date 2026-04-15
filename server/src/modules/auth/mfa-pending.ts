// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * MFA-pending challenge store.
 *
 * After password verification, if the user has MFA enabled we do NOT issue
 * a real session cookie yet. Instead we mint a short-lived token that
 * authorizes exactly one subsequent call to /api/auth/login/mfa. The token
 * is a random 32-byte value; only its SHA-256 hash is persisted in Redis.
 */

import { randomBytes, createHash } from "node:crypto";
import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

const TOKEN_KEY_PREFIX = "mfa-pending:";
const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes
const TOKEN_BYTES = 32;

export type MfaPendingError =
  | { code: "TOKEN_NOT_FOUND" }
  | { code: "DATABASE_ERROR"; cause: unknown };

export interface MfaPendingToken {
  token: string;
  expiresAt: Date;
}

let pendingRedis: RedisType | null = null;

function getRedis(): RedisType {
  if (!pendingRedis) {
    pendingRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return pendingRedis;
}

export function __setMfaPendingRedisForTests(redis: RedisType | null): void {
  pendingRedis = redis;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function keyFor(token: string): string {
  return `${TOKEN_KEY_PREFIX}${hashToken(token)}`;
}

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Create an MFA-pending token bound to a user ID. */
export async function createMfaPendingToken(
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<Result<MfaPendingToken, MfaPendingError>> {
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

/** Atomically read+delete a pending token, returning the bound userId. */
export async function consumeMfaPendingToken(
  token: string
): Promise<Result<string, MfaPendingError>> {
  try {
    const redis = getRedis();
    const key = keyFor(token);
    const userId = (await redis.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v;",
      1,
      key
    )) as string | null;
    if (!userId) {
      return err({ code: "TOKEN_NOT_FOUND" });
    }
    return ok(userId);
  } catch (cause) {
    return err({ code: "DATABASE_ERROR", cause });
  }
}

/** Peek (testing helper). */
export async function peekMfaPendingToken(
  token: string
): Promise<Result<string, MfaPendingError>> {
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

export const MFA_PENDING_TTL_SECONDS = DEFAULT_TTL_SECONDS;
