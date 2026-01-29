/**
 * LLM Error Types
 */

/** Error codes for LLM operations */
export type LLMErrorCode =
  | "TIMEOUT"
  | "CONNECTION_ERROR"
  | "INVALID_RESPONSE"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMITED"
  | "CONTEXT_LENGTH_EXCEEDED"
  | "UNKNOWN";

/** Structured error for LLM operations */
export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly statusCode: number | undefined;
  readonly provider: string;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    code: LLMErrorCode,
    provider: string,
    options?: { statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = "LLMError";
    this.code = code;
    this.provider = provider;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }

  /** Create a timeout error */
  static timeout(provider: string, timeoutMs: number): LLMError {
    return new LLMError(
      `Request timed out after ${timeoutMs}ms`,
      "TIMEOUT",
      provider
    );
  }

  /** Create a connection error */
  static connectionError(
    provider: string,
    baseUrl: string,
    cause?: Error
  ): LLMError {
    return new LLMError(
      `Failed to connect to ${provider} at ${baseUrl}`,
      "CONNECTION_ERROR",
      provider,
      cause ? { cause } : undefined
    );
  }

  /** Create an invalid response error */
  static invalidResponse(provider: string, details: string): LLMError {
    return new LLMError(
      `Invalid response from ${provider}: ${details}`,
      "INVALID_RESPONSE",
      provider
    );
  }

  /** Create a model not found error */
  static modelNotFound(provider: string, model: string): LLMError {
    return new LLMError(
      `Model "${model}" not found on ${provider}`,
      "MODEL_NOT_FOUND",
      provider,
      { statusCode: 404 }
    );
  }

  /** Create a rate limited error */
  static rateLimited(provider: string): LLMError {
    return new LLMError(
      `Rate limited by ${provider}`,
      "RATE_LIMITED",
      provider,
      { statusCode: 429 }
    );
  }

  /** Create a context length exceeded error */
  static contextLengthExceeded(provider: string, details?: string): LLMError {
    return new LLMError(
      `Context length exceeded${details ? `: ${details}` : ""}`,
      "CONTEXT_LENGTH_EXCEEDED",
      provider,
      { statusCode: 400 }
    );
  }

  /** Convert an unknown error to LLMError */
  static fromUnknown(provider: string, error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : "An unknown error occurred";

    if (error instanceof Error) {
      return new LLMError(message, "UNKNOWN", provider, { cause: error });
    }

    return new LLMError(message, "UNKNOWN", provider);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      provider: this.provider,
      statusCode: this.statusCode,
    };
  }
}
