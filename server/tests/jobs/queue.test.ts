// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";


describe("JobQueue", () => {
  // Mock BullMQ Queue at the module level
  const mockAdd = vi.fn();
  const mockAddBulk = vi.fn();
  const mockGetJob = vi.fn();
  const mockPause = vi.fn();
  const mockResume = vi.fn();
  const mockGetJobCounts = vi.fn();
  const mockClean = vi.fn();
  const mockClose = vi.fn();

  const mockQueueInstance = {
    add: mockAdd,
    addBulk: mockAddBulk,
    getJob: mockGetJob,
    pause: mockPause,
    resume: mockResume,
    getJobCounts: mockGetJobCounts,
    clean: mockClean,
    close: mockClose,
  };

  vi.doMock("bullmq", () => ({
    Queue: vi.fn(() => mockQueueInstance),
  }));

  vi.doMock("../../src/jobs/connection.js", () => ({
    createRedisConnection: vi.fn(() => ({})),
  }));

  beforeEach(async () => {
    vi.resetModules();
    mockAdd.mockReset();
    mockAddBulk.mockReset();
    mockGetJob.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    mockGetJobCounts.mockReset();
    mockClean.mockReset();
    mockClose.mockReset();
  });

  describe("add", () => {
    it("should add a job and return the job ID", async () => {
      mockAdd.mockResolvedValueOnce({ id: "job-123" });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.add("test-job", { message: "hello" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("job-123");
      }
    });

    it("should pass job options to BullMQ", async () => {
      mockAdd.mockResolvedValueOnce({ id: "job-456" });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      await queue.add(
        "test-job",
        { message: "hello" },
        {
          delay: 5000,
          attempts: 5,
          priority: 1,
        }
      );

      expect(mockAdd).toHaveBeenCalledWith(
        "test-job",
        { message: "hello" },
        expect.objectContaining({
          delay: 5000,
          attempts: 5,
          priority: 1,
        })
      );
    });

    it("should return error on failure", async () => {
      mockAdd.mockRejectedValueOnce(new Error("Redis connection failed"));

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.add("test-job", { message: "hello" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.name).toBe("JobError");
        expect(result.error.queueName).toBe("test-queue");
      }
    });
  });

  describe("addBulk", () => {
    it("should add multiple jobs and return IDs", async () => {
      mockAddBulk.mockResolvedValueOnce([
        { id: "job-1" },
        { id: "job-2" },
        { id: "job-3" },
      ]);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.addBulk([
        { name: "job-a", data: { message: "a" } },
        { name: "job-b", data: { message: "b" } },
        { name: "job-c", data: { message: "c" } },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(["job-1", "job-2", "job-3"]);
      }
    });
  });

  describe("getJob", () => {
    it("should return job info when found", async () => {
      mockGetJob.mockResolvedValueOnce({
        id: "job-123",
        name: "test-job",
        data: { message: "hello" },
        progress: { percentage: 50, message: "Processing" },
        attemptsMade: 1,
        returnvalue: null,
        failedReason: undefined,
        timestamp: 1234567890,
        processedOn: 1234567891,
        finishedOn: undefined,
      });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.getJob("job-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.id).toBe("job-123");
        expect(result.value!.name).toBe("test-job");
      }
    });

    it("should return null when job not found", async () => {
      mockGetJob.mockResolvedValueOnce(null);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.getJob("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe("getProgress", () => {
    it("should return progress object", async () => {
      mockGetJob.mockResolvedValueOnce({
        progress: { percentage: 75, message: "Almost done" },
      });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.getProgress("job-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          percentage: 75,
          message: "Almost done",
        });
      }
    });

    it("should handle numeric progress", async () => {
      mockGetJob.mockResolvedValueOnce({
        progress: 50,
      });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.getProgress("job-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ percentage: 50 });
      }
    });
  });

  describe("remove", () => {
    it("should remove job and return true", async () => {
      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      mockGetJob.mockResolvedValueOnce(mockJob);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.remove("job-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it("should return false when job not found", async () => {
      mockGetJob.mockResolvedValueOnce(null);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.remove("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe("pause/resume", () => {
    it("should pause the queue", async () => {
      mockPause.mockResolvedValueOnce(undefined);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.pause();

      expect(result.ok).toBe(true);
      expect(mockPause).toHaveBeenCalled();
    });

    it("should resume the queue", async () => {
      mockResume.mockResolvedValueOnce(undefined);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.resume();

      expect(result.ok).toBe(true);
      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe("getJobCounts", () => {
    it("should return job counts", async () => {
      mockGetJobCounts.mockResolvedValueOnce({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
        paused: 0,
      });

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.getJobCounts();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.waiting).toBe(5);
        expect(result.value.active).toBe(2);
        expect(result.value.completed).toBe(100);
      }
    });
  });

  describe("clean", () => {
    it("should clean old jobs", async () => {
      mockClean.mockResolvedValueOnce(["job-1", "job-2"]);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.clean(3600000, 100, "completed");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(["job-1", "job-2"]);
      }
      expect(mockClean).toHaveBeenCalledWith(3600000, 100, "completed");
    });
  });

  describe("close", () => {
    it("should close the queue", async () => {
      mockClose.mockResolvedValueOnce(undefined);

      const { JobQueue } = await import("../../src/jobs/queue.js");
      const queue = new JobQueue({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
      });

      const result = await queue.close();

      expect(result.ok).toBe(true);
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
