// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Job Queue Factory Functions
 *
 * Creates configured queue and worker instances.
 */

import { config } from "@/config/index.js";
import { JobQueue } from "./queue.js";
import { JobWorker, type JobWorkerOptions } from "./worker.js";
import type {
  BaseJobData,
  JobOptions,
  JobHandler,
  QueueConfig,
  WorkerConfig,
} from "./types.js";

/** Default job options */
export const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Create a job queue using the application configuration.
 *
 * @param name - Queue name
 * @param options - Optional default job options
 * @returns Configured JobQueue instance
 *
 * @example
 * ```typescript
 * const emailQueue = createQueue<EmailJobData>("emails");
 *
 * const result = await emailQueue.add("send-welcome", {
 *   to: "user@example.com",
 *   template: "welcome",
 * });
 *
 * if (result.ok) {
 *   console.log(`Job ${result.value} added`);
 * }
 * ```
 */
export function createQueue<TData extends BaseJobData>(
  name: string,
  options?: { defaultJobOptions?: JobOptions }
): JobQueue<TData> {
  return new JobQueue<TData>({
    name,
    redisUrl: config.redis.url,
    defaultJobOptions: options?.defaultJobOptions ?? DEFAULT_JOB_OPTIONS,
  });
}

/**
 * Create a job queue with custom configuration.
 *
 * @param queueConfig - Custom queue configuration
 * @param options - Optional default job options
 * @returns Configured JobQueue instance
 */
export function createQueueWithConfig<TData extends BaseJobData>(
  queueConfig: QueueConfig,
  options?: { defaultJobOptions?: JobOptions }
): JobQueue<TData> {
  return new JobQueue<TData>({
    ...queueConfig,
    defaultJobOptions:
      options?.defaultJobOptions ??
      queueConfig.defaultJobOptions ??
      DEFAULT_JOB_OPTIONS,
  });
}

/** Options for createWorker factory function */
interface CreateWorkerOptions extends JobWorkerOptions {
  concurrency?: number;
  lockDuration?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
}

/**
 * Create a job worker using the application configuration.
 *
 * @param queueName - Name of the queue to process
 * @param handler - Job handler function
 * @param options - Worker options
 * @returns Configured JobWorker instance
 *
 * @example
 * ```typescript
 * const worker = createWorker<EmailJobData, void>(
 *   "emails",
 *   async (data, context) => {
 *     await context.updateProgress({ percentage: 0, message: "Starting" });
 *
 *     // Check for cancellation
 *     if (context.signal.aborted) {
 *       throw new Error("Job cancelled");
 *     }
 *
 *     await sendEmail(data);
 *     await context.updateProgress({ percentage: 100, message: "Sent" });
 *   },
 *   {
 *     logger: console,
 *     onCompleted: (jobId) => console.log(`Job ${jobId} done`),
 *   }
 * );
 *
 * // Graceful shutdown on SIGTERM
 * process.on("SIGTERM", () => worker.shutdown());
 * ```
 */
export function createWorker<TData extends BaseJobData, TResult = unknown>(
  queueName: string,
  handler: JobHandler<TData, TResult>,
  options?: CreateWorkerOptions
): JobWorker<TData, TResult> {
  const workerConfig: WorkerConfig = {
    queueName,
    redisUrl: config.redis.url,
  };

  if (options?.concurrency !== undefined) {
    workerConfig.concurrency = options.concurrency;
  }
  if (options?.lockDuration !== undefined) {
    workerConfig.lockDuration = options.lockDuration;
  }
  if (options?.stalledInterval !== undefined) {
    workerConfig.stalledInterval = options.stalledInterval;
  }
  if (options?.maxStalledCount !== undefined) {
    workerConfig.maxStalledCount = options.maxStalledCount;
  }

  return new JobWorker<TData, TResult>(workerConfig, handler, options);
}

/**
 * Create a job worker with custom configuration.
 *
 * @param workerConfig - Custom worker configuration
 * @param handler - Job handler function
 * @param options - Worker options
 * @returns Configured JobWorker instance
 */
export function createWorkerWithConfig<
  TData extends BaseJobData,
  TResult = unknown,
>(
  workerConfig: WorkerConfig,
  handler: JobHandler<TData, TResult>,
  options?: JobWorkerOptions
): JobWorker<TData, TResult> {
  return new JobWorker<TData, TResult>(workerConfig, handler, options);
}
