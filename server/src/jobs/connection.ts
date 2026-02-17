// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Redis Connection for BullMQ
 */

import { Redis, type Redis as RedisType, type RedisOptions } from "ioredis";
import type { Result } from "@/types/index.js";
import { ok, err } from "@/types/index.js";
import { JobError } from "./errors.js";

/** Options for Redis connection */
export interface RedisConnectionOptions {
  /** Maximum number of retries per request (null for infinite) */
  maxRetriesPerRequest?: number | null;
  /** Enable ready check on connect */
  enableReadyCheck?: boolean;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Retry strategy configuration */
  retryStrategy?: {
    /** Maximum retry delay in milliseconds */
    maxDelay?: number;
    /** Maximum number of retries */
    maxRetries?: number;
  };
}

const DEFAULT_MAX_RETRIES_PER_REQUEST = null; // Required for BullMQ
const DEFAULT_ENABLE_READY_CHECK = true;
const DEFAULT_CONNECT_TIMEOUT = 10000;
const DEFAULT_RETRY_MAX_DELAY = 3000;
const DEFAULT_RETRY_MAX_RETRIES = 10;

/**
 * Create a Redis connection configured for BullMQ.
 *
 * @param url - Redis connection URL
 * @param options - Connection options
 * @returns Configured Redis instance
 */
export function createRedisConnection(
  url: string,
  options?: RedisConnectionOptions
): RedisType {
  const maxRetriesPerRequest =
    options?.maxRetriesPerRequest ?? DEFAULT_MAX_RETRIES_PER_REQUEST;
  const enableReadyCheck =
    options?.enableReadyCheck ?? DEFAULT_ENABLE_READY_CHECK;
  const connectTimeout = options?.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
  const retryMaxDelay =
    options?.retryStrategy?.maxDelay ?? DEFAULT_RETRY_MAX_DELAY;
  const retryMaxRetries =
    options?.retryStrategy?.maxRetries ?? DEFAULT_RETRY_MAX_RETRIES;

  const redisOptions: RedisOptions = {
    maxRetriesPerRequest,
    enableReadyCheck,
    connectTimeout,
    retryStrategy(times: number) {
      if (times > retryMaxRetries) {
        return null; // Stop retrying
      }
      // Exponential backoff with max delay
      const delay = Math.min(Math.pow(2, times) * 100, retryMaxDelay);
      return delay;
    },
  };

  const redis = new Redis(url, redisOptions);

  return redis;
}

/**
 * Check if a Redis connection is healthy.
 *
 * @param connection - Redis connection to check
 * @returns Result indicating health status
 */
export async function checkRedisHealth(
  connection: RedisType
): Promise<Result<boolean, JobError>> {
  try {
    const pong = await connection.ping();
    return ok(pong === "PONG");
  } catch (error) {
    return err(
      JobError.connectionError(
        connection.options.host ?? "unknown",
        error instanceof Error ? error : undefined
      )
    );
  }
}

/**
 * Close a Redis connection gracefully.
 *
 * @param connection - Redis connection to close
 */
export async function closeRedisConnection(
  connection: RedisType
): Promise<void> {
  await connection.quit();
}
