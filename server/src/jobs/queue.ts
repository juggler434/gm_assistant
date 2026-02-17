// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Job Queue Wrapper
 */

import { Queue, type JobsOptions } from "bullmq";
import type { Result } from "@/types/index.js";
import { ok, err } from "@/types/index.js";
import { JobError } from "./errors.js";
import { createRedisConnection } from "./connection.js";
import type {
  BaseJobData,
  JobOptions,
  JobProgress,
  JobInfo,
  JobCounts,
  BulkJobDefinition,
  QueueConfig,
} from "./types.js";

/**
 * Convert our JobOptions to BullMQ JobsOptions
 */
function toBullMQOptions(options?: JobOptions): JobsOptions | undefined {
  if (!options) return undefined;

  const result: JobsOptions = {};

  if (options.delay !== undefined) result.delay = options.delay;
  if (options.attempts !== undefined) result.attempts = options.attempts;
  if (options.backoff !== undefined) {
    result.backoff = {
      type: options.backoff.type,
      delay: options.backoff.delay,
    };
  }
  if (options.priority !== undefined) result.priority = options.priority;
  if (options.removeOnComplete !== undefined)
    result.removeOnComplete = options.removeOnComplete;
  if (options.removeOnFail !== undefined)
    result.removeOnFail = options.removeOnFail;
  if (options.jobId !== undefined) result.jobId = options.jobId;

  return result;
}

/**
 * Wrapper around BullMQ Queue with Result-based error handling.
 */
export class JobQueue<TData extends BaseJobData> {
  private readonly queue: Queue;
  readonly name: string;

  constructor(config: QueueConfig) {
    this.name = config.name;

    const connection = config.redisUrl
      ? createRedisConnection(config.redisUrl)
      : undefined;

    const defaultJobOptions = toBullMQOptions(config.defaultJobOptions);

    // BullMQ requires a connection option - use empty object for default Redis connection
    const queueConnection = connection ?? {};

    if (defaultJobOptions) {
      this.queue = new Queue(config.name, { connection: queueConnection, defaultJobOptions });
    } else {
      this.queue = new Queue(config.name, { connection: queueConnection });
    }
  }

  /**
   * Add a job to the queue.
   *
   * @param name - Job name
   * @param data - Job data
   * @param options - Job options
   * @returns Job ID on success
   */
  async add(
    name: string,
    data: TData,
    options?: JobOptions
  ): Promise<Result<string, JobError>> {
    try {
      const job = await this.queue.add(name, data, toBullMQOptions(options));
      return ok(job.id!);
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Add multiple jobs to the queue.
   *
   * @param jobs - Array of job definitions
   * @returns Array of job IDs on success
   */
  async addBulk(
    jobs: BulkJobDefinition<TData>[]
  ): Promise<Result<string[], JobError>> {
    try {
      const bullJobs = jobs.map((job) => {
        const jobDef: { name: string; data: TData; opts?: JobsOptions } = {
          name: job.name,
          data: job.data,
        };
        const opts = toBullMQOptions(job.opts);
        if (opts) jobDef.opts = opts;
        return jobDef;
      });

      const added = await this.queue.addBulk(bullJobs);
      return ok(added.map((j) => j.id!));
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Get a job by ID.
   *
   * @param id - Job ID
   * @returns Job info or null if not found
   */
  async getJob<TResult = unknown>(
    id: string
  ): Promise<Result<JobInfo<TData, TResult> | null, JobError>> {
    try {
      const job = await this.queue.getJob(id);
      if (!job) {
        return ok(null);
      }

      const jobInfo: JobInfo<TData, TResult> = {
        id: job.id!,
        name: job.name,
        data: job.data as TData,
        progress: job.progress as JobProgress | number,
        attemptsMade: job.attemptsMade,
        returnvalue: job.returnvalue as TResult | undefined,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      };
      return ok(jobInfo);
    } catch (error) {
      return err(
        JobError.fromUnknown(error, { queueName: this.name, jobId: id })
      );
    }
  }

  /**
   * Get the progress of a job.
   *
   * @param id - Job ID
   * @returns Job progress or null if job not found
   */
  async getProgress(id: string): Promise<Result<JobProgress | null, JobError>> {
    try {
      const job = await this.queue.getJob(id);
      if (!job) {
        return ok(null);
      }

      const progress = job.progress;
      if (typeof progress === "number") {
        return ok({ percentage: progress });
      }
      return ok(progress as JobProgress);
    } catch (error) {
      return err(
        JobError.fromUnknown(error, { queueName: this.name, jobId: id })
      );
    }
  }

  /**
   * Remove a job from the queue.
   *
   * @param id - Job ID
   * @returns True if removed, false if not found
   */
  async remove(id: string): Promise<Result<boolean, JobError>> {
    try {
      const job = await this.queue.getJob(id);
      if (!job) {
        return ok(false);
      }
      await job.remove();
      return ok(true);
    } catch (error) {
      return err(
        JobError.fromUnknown(error, { queueName: this.name, jobId: id })
      );
    }
  }

  /**
   * Pause the queue.
   */
  async pause(): Promise<Result<void, JobError>> {
    try {
      await this.queue.pause();
      return ok(undefined);
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Resume the queue.
   */
  async resume(): Promise<Result<void, JobError>> {
    try {
      await this.queue.resume();
      return ok(undefined);
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Get job counts by state.
   */
  async getJobCounts(): Promise<Result<JobCounts, JobError>> {
    try {
      const counts = await this.queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused"
      );
      return ok({
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      });
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Clean old jobs from the queue.
   *
   * @param grace - Time in milliseconds for job to be considered old
   * @param limit - Maximum number of jobs to remove
   * @param status - Job status to clean
   */
  async clean(
    grace: number,
    limit: number,
    status:
      | "completed"
      | "failed"
      | "delayed"
      | "paused"
      | "wait" = "completed"
  ): Promise<Result<string[], JobError>> {
    try {
      const removed = await this.queue.clean(grace, limit, status);
      return ok(removed);
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Close the queue connection.
   */
  async close(): Promise<Result<void, JobError>> {
    try {
      await this.queue.close();
      return ok(undefined);
    } catch (error) {
      return err(JobError.fromUnknown(error, { queueName: this.name }));
    }
  }

  /**
   * Get the underlying BullMQ Queue instance.
   * Use with caution - prefer the wrapper methods.
   */
  get bullmqQueue(): Queue {
    return this.queue;
  }
}
