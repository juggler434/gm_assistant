// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Job Queue Module
 *
 * BullMQ-based job queue system with reliable queuing, retry with backoff,
 * and progress tracking.
 *
 * @example
 * ```typescript
 * import {
 *   createQueue,
 *   createWorker,
 *   registerHandler,
 * } from "@/jobs/index.js";
 *
 * // Define job data type
 * interface EmailJobData {
 *   to: string;
 *   subject: string;
 *   body: string;
 * }
 *
 * // Create queue
 * const emailQueue = createQueue<EmailJobData>("emails");
 *
 * // Create worker
 * const worker = createWorker<EmailJobData, void>(
 *   "emails",
 *   async (data, context) => {
 *     await context.updateProgress({ percentage: 0, message: "Starting" });
 *     await sendEmail(data);
 *     await context.updateProgress({ percentage: 100, message: "Sent" });
 *   }
 * );
 *
 * // Add job
 * const result = await emailQueue.add("send-welcome", {
 *   to: "user@example.com",
 *   subject: "Welcome!",
 *   body: "Hello!",
 * });
 *
 * // Graceful shutdown
 * process.on("SIGTERM", () => worker.shutdown());
 * ```
 */

// Factory functions
export {
  createQueue,
  createQueueWithConfig,
  createWorker,
  createWorkerWithConfig,
  DEFAULT_JOB_OPTIONS,
} from "./factory.js";

// Classes
export { JobQueue } from "./queue.js";
export { JobWorker, type JobWorkerOptions } from "./worker.js";

// Types
export type {
  BaseJobData,
  JobProgress,
  JobOptions,
  BackoffOptions,
  QueueConfig,
  WorkerConfig,
  JobLogger,
  JobContext,
  JobHandler,
  HandlerDefinition,
  JobInfo,
  JobCounts,
  BulkJobDefinition,
} from "./types.js";

// Errors
export { JobError, type JobErrorCode } from "./errors.js";

// Connection utilities
export {
  createRedisConnection,
  checkRedisHealth,
  closeRedisConnection,
  type RedisConnectionOptions,
} from "./connection.js";

// Handler registry
export {
  registerHandler,
  getHandler,
  getAllHandlers,
  hasHandler,
  removeHandler,
  clearHandlers,
} from "./handlers/index.js";
