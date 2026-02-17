// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Redis } from "ioredis";
import {
  createRedisConnection,
  checkRedisHealth,
  closeRedisConnection,
} from "../../src/jobs/connection.js";
import { JobError } from "../../src/jobs/errors.js";

// Mock ioredis
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
    quit: vi.fn(),
    options: { host: "localhost" },
  }));
  return { Redis: MockRedis, default: MockRedis };
});

describe("connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRedisConnection", () => {
    it("should create a Redis connection with default options", async () => {
      const { Redis: MockRedis } = await import("ioredis");
      const connection = createRedisConnection("redis://localhost:6379");

      expect(MockRedis).toHaveBeenCalledWith(
        "redis://localhost:6379",
        expect.objectContaining({
          maxRetriesPerRequest: null, // Required for BullMQ
          enableReadyCheck: true,
        })
      );
      expect(connection).toBeDefined();
    });

    it("should accept custom options", async () => {
      const { Redis: MockRedis } = await import("ioredis");
      createRedisConnection("redis://localhost:6379", {
        connectTimeout: 5000,
        enableReadyCheck: false,
      });

      expect(MockRedis).toHaveBeenCalledWith(
        "redis://localhost:6379",
        expect.objectContaining({
          connectTimeout: 5000,
          enableReadyCheck: false,
        })
      );
    });
  });

  describe("checkRedisHealth", () => {
    it("should return ok(true) when ping succeeds", async () => {
      const mockConnection = {
        ping: vi.fn().mockResolvedValue("PONG"),
        options: { host: "localhost" },
      };

      const result = await checkRedisHealth(mockConnection as unknown as Redis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return ok(false) when ping returns unexpected value", async () => {
      const mockConnection = {
        ping: vi.fn().mockResolvedValue("NOT_PONG"),
        options: { host: "localhost" },
      };

      const result = await checkRedisHealth(mockConnection as unknown as Redis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should return error when ping fails", async () => {
      const mockConnection = {
        ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
        options: { host: "localhost" },
      };

      const result = await checkRedisHealth(mockConnection as unknown as Redis);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(JobError);
        expect(result.error.code).toBe("CONNECTION_ERROR");
      }
    });
  });

  describe("closeRedisConnection", () => {
    it("should call quit on the connection", async () => {
      const mockConnection = {
        quit: vi.fn().mockResolvedValue("OK"),
      };

      await closeRedisConnection(mockConnection as unknown as Redis);

      expect(mockConnection.quit).toHaveBeenCalled();
    });
  });
});
