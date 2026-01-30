/**
 * Job Queue Error Types
 */

/** Error codes for job operations */
export type JobErrorCode =
  | "CONNECTION_ERROR"
  | "HANDLER_ERROR"
  | "TIMEOUT"
  | "STALLED"
  | "MAX_RETRIES_EXCEEDED"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

/** Options for creating a JobError */
interface JobErrorOptions {
  queueName?: string | undefined;
  jobId?: string | undefined;
  cause?: Error | undefined;
}

/** Structured error for job operations */
export class JobError extends Error {
  readonly code: JobErrorCode;
  readonly queueName: string | undefined;
  readonly jobId: string | undefined;
  override readonly cause: Error | undefined;

  constructor(message: string, code: JobErrorCode, options?: JobErrorOptions) {
    super(message);
    this.name = "JobError";
    this.code = code;
    this.queueName = options?.queueName;
    this.jobId = options?.jobId;
    this.cause = options?.cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JobError);
    }
  }

  /** Create a connection error */
  static connectionError(url: string, cause?: Error): JobError {
    return new JobError(`Failed to connect to Redis at ${url}`, "CONNECTION_ERROR", {
      cause,
    });
  }

  /** Create a handler error */
  static handlerError(queueName: string, jobId: string, cause?: Error): JobError {
    return new JobError(
      `Job handler failed for job ${jobId} in queue ${queueName}`,
      "HANDLER_ERROR",
      { queueName, jobId, cause }
    );
  }

  /** Create a timeout error */
  static timeout(queueName: string, jobId: string, timeoutMs: number): JobError {
    return new JobError(`Job ${jobId} timed out after ${timeoutMs}ms`, "TIMEOUT", {
      queueName,
      jobId,
    });
  }

  /** Create a stalled error */
  static stalled(queueName: string, jobId: string): JobError {
    return new JobError(`Job ${jobId} stalled in queue ${queueName}`, "STALLED", {
      queueName,
      jobId,
    });
  }

  /** Create a max retries exceeded error */
  static maxRetriesExceeded(
    queueName: string,
    jobId: string,
    attempts: number
  ): JobError {
    return new JobError(
      `Job ${jobId} exceeded max retries (${attempts} attempts)`,
      "MAX_RETRIES_EXCEEDED",
      { queueName, jobId }
    );
  }

  /** Create a validation error */
  static validationError(message: string, queueName?: string): JobError {
    return new JobError(message, "VALIDATION_ERROR", { queueName });
  }

  /** Convert an unknown error to JobError */
  static fromUnknown(
    error: unknown,
    options?: { queueName?: string; jobId?: string }
  ): JobError {
    if (error instanceof JobError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : "An unknown error occurred";

    if (error instanceof Error) {
      return new JobError(message, "UNKNOWN", { ...options, cause: error });
    }

    return new JobError(message, "UNKNOWN", options);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      queueName: this.queueName,
      jobId: this.jobId,
    };
  }
}
