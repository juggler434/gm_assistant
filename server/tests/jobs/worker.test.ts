import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobError } from "../../src/jobs/errors.js";
import type { JobLogger } from "../../src/jobs/types.js";

describe("JobWorker", () => {
  // Store the processor function
  let capturedProcessor: ((job: any) => Promise<any>) | null = null;

  // Mock worker methods
  const mockOn = vi.fn();
  const mockClose = vi.fn();
  const mockPause = vi.fn();
  const mockResume = vi.fn();
  const mockIsRunning = vi.fn();
  const mockIsPaused = vi.fn();

  const mockWorkerInstance = {
    on: mockOn,
    close: mockClose,
    pause: mockPause,
    resume: mockResume,
    isRunning: mockIsRunning,
    isPaused: mockIsPaused,
  };

  vi.doMock("bullmq", () => ({
    Worker: vi.fn((_name: string, processor: any, _opts: any) => {
      capturedProcessor = processor;
      return mockWorkerInstance;
    }),
  }));

  vi.doMock("../../src/jobs/connection.js", () => ({
    createRedisConnection: vi.fn(() => ({})),
  }));

  function createMockLogger(): JobLogger {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    capturedProcessor = null;
    mockOn.mockReset();
    mockClose.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    mockIsRunning.mockReset();
    mockIsPaused.mockReset();
  });

  describe("constructor", () => {
    it("should create worker and set up event handlers", async () => {
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      expect(mockOn).toHaveBeenCalledWith("completed", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("failed", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("stalled", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
    });
  });

  describe("job processing", () => {
    it("should call handler with correct context", async () => {
      const mockLogger = createMockLogger();
      const handler = vi.fn().mockResolvedValue("result");

      const { JobWorker } = await import("../../src/jobs/worker.js");
      new JobWorker({ queueName: "test-queue" }, handler, { logger: mockLogger });

      const mockJob = {
        id: "job-123",
        name: "test-job",
        data: { value: 42 },
        updateProgress: vi.fn(),
      };

      const result = await capturedProcessor!(mockJob);

      expect(handler).toHaveBeenCalledWith(
        { value: 42 },
        expect.objectContaining({
          updateProgress: expect.any(Function),
          logger: expect.any(Object),
          signal: expect.any(AbortSignal),
          job: mockJob,
        })
      );
      expect(result).toBe("result");
    });

    it("should allow progress updates", async () => {
      const mockLogger = createMockLogger();
      const handler = vi.fn().mockImplementation(async (_data, context) => {
        await context.updateProgress({ percentage: 50, message: "Halfway" });
        return "done";
      });

      const { JobWorker } = await import("../../src/jobs/worker.js");
      new JobWorker({ queueName: "test-queue" }, handler, { logger: mockLogger });

      const mockJob = {
        id: "job-123",
        name: "test-job",
        data: { value: 42 },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      await capturedProcessor!(mockJob);

      expect(mockJob.updateProgress).toHaveBeenCalledWith({
        percentage: 50,
        message: "Halfway",
      });
    });

    it("should provide job-scoped logger", async () => {
      const mockLogger = createMockLogger();
      const handler = vi.fn().mockImplementation(async (_data, context) => {
        context.logger.info("Processing", { extra: "data" });
        return "done";
      });

      const { JobWorker } = await import("../../src/jobs/worker.js");
      new JobWorker({ queueName: "test-queue" }, handler, { logger: mockLogger });

      const mockJob = {
        id: "job-123",
        name: "test-job",
        data: { value: 42 },
        updateProgress: vi.fn(),
      };

      await capturedProcessor!(mockJob);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Processing",
        expect.objectContaining({ jobId: "job-123", extra: "data" })
      );
    });

    it("should wrap handler errors in JobError", async () => {
      const mockLogger = createMockLogger();
      const handler = vi.fn().mockRejectedValue(new Error("Handler failed"));

      const { JobWorker } = await import("../../src/jobs/worker.js");
      new JobWorker({ queueName: "test-queue" }, handler, { logger: mockLogger });

      const mockJob = {
        id: "job-123",
        name: "test-job",
        data: { value: 42 },
        updateProgress: vi.fn(),
      };

      await expect(capturedProcessor!(mockJob)).rejects.toMatchObject({
        name: "JobError",
        code: "HANDLER_ERROR",
      });
    });
  });

  describe("pause/resume", () => {
    it("should pause the worker", async () => {
      mockPause.mockResolvedValueOnce(undefined);
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      await worker.pause();

      expect(mockPause).toHaveBeenCalled();
    });

    it("should resume the worker", async () => {
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      worker.resume();

      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe("status checks", () => {
    it("should check if worker is running", async () => {
      mockIsRunning.mockReturnValue(true);

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker({ queueName: "test-queue" }, vi.fn());

      expect(worker.isRunning()).toBe(true);
    });

    it("should check if worker is paused", async () => {
      mockIsPaused.mockReturnValue(false);

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker({ queueName: "test-queue" }, vi.fn());

      expect(worker.isPaused()).toBe(false);
    });
  });

  describe("shutdown", () => {
    it("should close the worker", async () => {
      mockClose.mockResolvedValueOnce(undefined);
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      await worker.shutdown();

      expect(mockClose).toHaveBeenCalledWith(false);
    });

    it("should log shutdown info", async () => {
      mockClose.mockResolvedValueOnce(undefined);
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      await worker.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Worker shutting down",
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Worker shutdown complete",
        expect.any(Object)
      );
    });

    it("should not shutdown twice", async () => {
      mockClose.mockResolvedValue(undefined);
      const mockLogger = createMockLogger();

      const { JobWorker } = await import("../../src/jobs/worker.js");
      const worker = new JobWorker(
        { queueName: "test-queue" },
        vi.fn(),
        { logger: mockLogger }
      );

      await worker.shutdown();
      await worker.shutdown();

      // Close should only be called once
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
