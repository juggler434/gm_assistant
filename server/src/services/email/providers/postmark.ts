// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Postmark email provider.
 *
 * Uses the Postmark HTTP API directly via fetch so we don't take a hard
 * dependency on the Postmark SDK. The API surface we use is small enough
 * that the savings on transitive deps + bundle size are worth it.
 *
 * @see https://postmarkapp.com/developer/api/email-api
 */

import { ok, err, type Result } from "@/types/index.js";
import { EmailError, type SendEmailRequest, type SendEmailResponse } from "../types.js";
import type { EmailProvider } from "./interface.js";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

export interface PostmarkProviderOptions {
  /** Postmark server token. */
  serverToken: string;
  /** Verified sender email address ("From" field). */
  fromAddress: string;
  /** Optional "From" display name (e.g., "GM Assistant"). */
  fromName?: string;
  /** Optional fetch override (for tests). */
  fetchImpl?: typeof fetch;
}

interface PostmarkResponse {
  ErrorCode: number;
  Message: string;
  MessageID?: string;
  To?: string;
}

export class PostmarkProvider implements EmailProvider {
  readonly name = "postmark";
  private readonly options: PostmarkProviderOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PostmarkProviderOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(
    request: SendEmailRequest
  ): Promise<Result<SendEmailResponse, EmailError>> {
    const from = this.options.fromName
      ? `${this.options.fromName} <${this.options.fromAddress}>`
      : this.options.fromAddress;

    const body: Record<string, string> = {
      From: from,
      To: request.to,
      Subject: request.subject,
      TextBody: request.text,
      MessageStream: request.messageStream ?? "outbound",
    };
    if (request.html) {
      body.HtmlBody = request.html;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(POSTMARK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": this.options.serverToken,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      return err(
        new EmailError(
          `Postmark request failed: ${cause instanceof Error ? cause.message : "unknown"}`,
          "PROVIDER_ERROR",
          cause
        )
      );
    }

    let payload: PostmarkResponse;
    try {
      payload = (await response.json()) as PostmarkResponse;
    } catch (cause) {
      return err(
        new EmailError(
          `Postmark returned invalid JSON (status ${response.status})`,
          "PROVIDER_ERROR",
          cause
        )
      );
    }

    if (!response.ok || payload.ErrorCode !== 0) {
      // Postmark error code 300 means inactive recipient.
      // 406 means inactive recipient (hard bounce). 422 means invalid
      // request. We surface those as INVALID_RECIPIENT so callers can
      // distinguish them from transient provider errors.
      const isRecipientError =
        response.status === 422 || payload.ErrorCode === 406 || payload.ErrorCode === 300;
      return err(
        new EmailError(
          `Postmark error (${payload.ErrorCode}): ${payload.Message}`,
          isRecipientError ? "INVALID_RECIPIENT" : "PROVIDER_ERROR"
        )
      );
    }

    const result: SendEmailResponse = {};
    if (payload.MessageID) {
      result.messageId = payload.MessageID;
    }
    return ok(result);
  }
}
