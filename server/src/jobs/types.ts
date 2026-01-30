/**
 * Job Queue Type Definitions
 */

import type { Job } from "bullmq";

/** Base interface for all job data */
export interface BaseJobData {
  [key: string]: unknown;
}

/** Job progress information */
export interface JobProgress {
  /** Percentage complete (0-100) */
  percentage: number;
  /** Human-readable progress message */
  message?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Backoff configuration for retries */
export interface BackoffOptions {
  /** Type of backoff strategy */
  type: "fixed" | "exponential";
  /** Initial delay in milliseconds */
  delay: number;
}

/** Options for individual jobs */
export interface JobOptions {
  /** Delay before job runs in milliseconds */
  delay?: number;
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff configuration for retries */
  backoff?: BackoffOptions;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Number of completed jobs to keep */
  removeOnComplete?: boolean | number;
  /** Number of failed jobs to keep */
  removeOnFail?: boolean | number;
  /** Job ID (must be unique) */
  jobId?: string;
}

/** Queue configuration */
export interface QueueConfig {
  /** Queue name */
  name: string;
  /** Redis connection URL */
  redisUrl?: string;
  /** Default job options */
  defaultJobOptions?: JobOptions;
}

/** Worker configuration */
export interface WorkerConfig {
  /** Queue name to process */
  queueName: string;
  /** Redis connection URL */
  redisUrl?: string;
  /** Number of concurrent jobs */
  concurrency?: number;
  /** Lock duration in milliseconds */
  lockDuration?: number;
  /** How often to check for stalled jobs (ms) */
  stalledInterval?: number;
  /** Max stalled count before job is failed */
  maxStalledCount?: number;
}

/** Logger interface for jobs */
export interface JobLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Context passed to job handlers */
export interface JobContext {
  /** Update job progress */
  updateProgress(progress: JobProgress): Promise<void>;
  /** Logger for the job */
  logger: JobLogger;
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /** The BullMQ job instance */
  job: Job;
}

/** Job handler function signature */
export type JobHandler<TData extends BaseJobData, TResult> = (
  data: TData,
  context: JobContext
) => Promise<TResult>;

/** Handler definition for registration */
export interface HandlerDefinition<
  TData extends BaseJobData = BaseJobData,
  TResult = unknown,
> {
  /** Queue name this handler processes */
  queueName: string;
  /** The handler function */
  handler: JobHandler<TData, TResult>;
  /** Description of what this handler does */
  description?: string;
}

/** Job information returned from queue queries */
export interface JobInfo<TData = unknown, TResult = unknown> {
  /** Job ID */
  id: string;
  /** Job name */
  name: string;
  /** Job data */
  data: TData;
  /** Job progress */
  progress: JobProgress | number;
  /** Number of attempts made */
  attemptsMade: number;
  /** Job result (if completed) */
  returnvalue: TResult | undefined;
  /** Failure reason (if failed) */
  failedReason: string | undefined;
  /** Timestamp when job was created */
  timestamp: number;
  /** Timestamp when job was processed */
  processedOn: number | undefined;
  /** Timestamp when job finished */
  finishedOn: number | undefined;
}

/** Job counts by state */
export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/** Options for bulk job addition */
export interface BulkJobDefinition<TData extends BaseJobData> {
  /** Job name */
  name: string;
  /** Job data */
  data: TData;
  /** Job options */
  opts?: JobOptions;
}
