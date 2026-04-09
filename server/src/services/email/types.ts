// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Email service types.
 */

export interface SendEmailRequest {
  /** Recipient email address. */
  to: string;
  /** Subject line. */
  subject: string;
  /** Plain-text body. */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /**
   * Optional Postmark message stream override (e.g. "outbound" for
   * transactional, "broadcast" for marketing). Defaults to "outbound".
   */
  messageStream?: string;
}

export interface SendEmailResponse {
  /** Provider-issued message ID, when available. */
  messageId?: string;
}

export type EmailErrorCode =
  | "INVALID_RECIPIENT"
  | "PROVIDER_ERROR"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export class EmailError extends Error {
  readonly code: EmailErrorCode;
  override readonly cause: unknown;

  constructor(message: string, code: EmailErrorCode, cause?: unknown) {
    super(message);
    this.name = "EmailError";
    this.code = code;
    this.cause = cause;
  }
}
