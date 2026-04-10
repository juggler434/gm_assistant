// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Brute-force protection for authentication endpoints.
 *
 * Tracks failed login attempts per email address in Redis. After
 * MAX_FAILED_ATTEMPTS consecutive failures the account is temporarily
 * locked out for LOCKOUT_DURATION_SECONDS. The counter resets on
 * successful login.
 */

import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";

const KEY_PREFIX = "brute-force:";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes

export interface BruteForceStatus {
  locked: boolean;
  attempts: number;
  /** Seconds remaining until lockout expires (0 if not locked). */
  retryAfter: number;
}

/** Lazy-initialized Redis connection. */
let bruteForceRedis: RedisType | null = null;

function getRedis(): RedisType {
  if (!bruteForceRedis) {
    bruteForceRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return bruteForceRedis;
}

/**
 * Override the Redis connection used by this module. Test-only escape hatch.
 */
export function __setBruteForceRedisForTests(redis: RedisType | null): void {
  bruteForceRedis = redis;
}

function keyFor(email: string): string {
  return `${KEY_PREFIX}${email.toLowerCase()}`;
}

/**
 * Check whether the given email is currently locked out.
 */
export async function checkBruteForce(email: string): Promise<BruteForceStatus> {
  const redis = getRedis();
  const key = keyFor(email);

  const [attemptsStr, ttl] = await Promise.all([
    redis.get(key),
    redis.ttl(key),
  ]);

  const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  const locked = attempts >= MAX_FAILED_ATTEMPTS;
  const retryAfter = locked && ttl > 0 ? ttl : 0;

  return { locked, attempts, retryAfter };
}

/**
 * Record a failed login attempt for the given email.
 * Returns the updated status (which may now be locked).
 */
export async function recordFailedAttempt(email: string): Promise<BruteForceStatus> {
  const redis = getRedis();
  const key = keyFor(email);

  const attempts = await redis.incr(key);

  // Set/refresh TTL so the counter auto-expires after the lockout window.
  // We always set this — even before max attempts — so stale counters
  // don't linger forever.
  await redis.expire(key, LOCKOUT_DURATION_SECONDS);

  const locked = attempts >= MAX_FAILED_ATTEMPTS;
  const retryAfter = locked ? LOCKOUT_DURATION_SECONDS : 0;

  return { locked, attempts, retryAfter };
}

/**
 * Reset the failed-attempt counter for the given email (call on successful login).
 */
export async function resetFailedAttempts(email: string): Promise<void> {
  const redis = getRedis();
  await redis.del(keyFor(email));
}

export { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_SECONDS };
