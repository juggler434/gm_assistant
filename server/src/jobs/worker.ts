// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Job Worker with Graceful Shutdown
 */

import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "./connection.js";
import { JobError } from "./errors.js";
import type {
  BaseJobData,
  JobHandler,
  JobContext,
  JobLogger,
  JobProgress,
  WorkerConfig,
} from "./types.js";

/** Default logger that does nothing */
const noopLogger: JobLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Options for creating a worker */
export interface JobWorkerOptions {
  /** Logger for worker events */
  logger?: JobLogger;
  /** Callback when a job completes */
  onCompleted?: (jobId: string, result: unknown) => void;
  /** Callback when a job fails */
  onFailed?: (jobId: string, error: Error) => void;
  /** Callback when a job stalls */
  onStalled?: (jobId: string) => void;
  /** Callback for worker errors */
  onError?: (error: Error) => void;
}

/**
 * Worker wrapper with graceful shutdown and abort signal support.
 */
export class JobWorker<TData extends BaseJobData, TResult = unknown> {
  private readonly worker: Worker<TData, TResult>;
  private readonly logger: JobLogger;
  private readonly activeJobs: Map<string, AbortController> = new Map();
  private isShuttingDown = false;
  readonly queueName: string;

  constructor(
    config: WorkerConfig,
    handler: JobHandler<TData, TResult>,
    options?: JobWorkerOptions
  ) {
    this.queueName = config.queueName;
    this.logger = options?.logger ?? noopLogger;

    const connection = config.redisUrl
      ? createRedisConnection(config.redisUrl)
      : {};

    const concurrency = config.concurrency ?? 1;
    const lockDuration = config.lockDuration ?? 30000;
    const stalledInterval = config.stalledInterval ?? 30000;
    const maxStalledCount = config.maxStalledCount ?? 1;

    const processor = async (job: Job<TData, TResult>) => {
      return this.processJob(job, handler);
    };

    this.worker = new Worker<TData, TResult>(config.queueName, processor, {
      connection,
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
    });

    this.setupEventHandlers(options);
  }

  private setupEventHandlers(options?: JobWorkerOptions): void {
    this.worker.on("completed", (job, result) => {
      this.logger.info("Job completed", {
        jobId: job.id,
        queue: this.queueName,
      });
      options?.onCompleted?.(job.id!, result);
    });

    this.worker.on("failed", (job, error) => {
      if (job) {
        this.logger.error("Job failed", {
          jobId: job.id,
          queue: this.queueName,
          error: error.message,
          attemptsMade: job.attemptsMade,
        });
        options?.onFailed?.(job.id!, error);
      }
    });

    this.worker.on("stalled", (jobId) => {
      this.logger.warn("Job stalled", {
        jobId,
        queue: this.queueName,
      });
      options?.onStalled?.(jobId);
    });

    this.worker.on("error", (error) => {
      this.logger.error("Worker error", {
        queue: this.queueName,
        error: error.message,
      });
      options?.onError?.(error);
    });
  }

  private async processJob(
    job: Job<TData, TResult>,
    handler: JobHandler<TData, TResult>
  ): Promise<TResult> {
    const abortController = new AbortController();
    this.activeJobs.set(job.id!, abortController);

    try {
      this.logger.debug("Processing job", {
        jobId: job.id,
        name: job.name,
        queue: this.queueName,
      });

      const context: JobContext = {
        updateProgress: async (progress: JobProgress) => {
          await job.updateProgress(progress);
        },
        logger: {
          debug: (message, meta) =>
            this.logger.debug(message, { ...meta, jobId: job.id }),
          info: (message, meta) =>
            this.logger.info(message, { ...meta, jobId: job.id }),
          warn: (message, meta) =>
            this.logger.warn(message, { ...meta, jobId: job.id }),
          error: (message, meta) =>
            this.logger.error(message, { ...meta, jobId: job.id }),
        },
        signal: abortController.signal,
        job,
      };

      const result = await handler(job.data, context);
      return result;
    } catch (error) {
      throw JobError.handlerError(
        this.queueName,
        job.id!,
        error instanceof Error ? error : undefined
      );
    } finally {
      this.activeJobs.delete(job.id!);
    }
  }

  /**
   * Gracefully shut down the worker.
   *
   * @param timeoutMs - Maximum time to wait for jobs to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info("Worker shutting down", {
      queue: this.queueName,
      activeJobs: this.activeJobs.size,
    });

    // Signal all active jobs to abort
    for (const [jobId, controller] of this.activeJobs) {
      this.logger.debug("Aborting active job", { jobId });
      controller.abort();
    }

    // Close the worker with timeout
    await this.worker.close(false);

    // Wait for active jobs to complete or timeout
    const startTime = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.activeJobs.size > 0) {
      this.logger.warn("Shutdown timeout, jobs still active", {
        activeJobs: Array.from(this.activeJobs.keys()),
      });
    }

    this.logger.info("Worker shutdown complete", { queue: this.queueName });
  }

  /**
   * Pause the worker from processing new jobs.
   */
  async pause(doNotWaitActive: boolean = false): Promise<void> {
    await this.worker.pause(doNotWaitActive);
    this.logger.info("Worker paused", { queue: this.queueName });
  }

  /**
   * Resume processing jobs.
   */
  resume(): void {
    this.worker.resume();
    this.logger.info("Worker resumed", { queue: this.queueName });
  }

  /**
   * Check if the worker is running.
   */
  isRunning(): boolean {
    return this.worker.isRunning();
  }

  /**
   * Check if the worker is paused.
   */
  isPaused(): boolean {
    return this.worker.isPaused();
  }

  /**
   * Get the number of currently active jobs.
   */
  get activeJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Get the underlying BullMQ Worker instance.
   * Use with caution - prefer the wrapper methods.
   */
  get bullmqWorker(): Worker<TData, TResult> {
    return this.worker;
  }
}
