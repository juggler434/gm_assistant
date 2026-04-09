// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Log-only email provider used in development and tests.
 *
 * Writes the message to the supplied logger (or console) instead of
 * actually sending mail. This lets the verification flow work end-to-end
 * locally without configuring Postmark.
 */

import { ok, type Result } from "@/types/index.js";
import type { SendEmailRequest, SendEmailResponse, EmailError } from "../types.js";
import type { EmailProvider } from "./interface.js";

export interface LogProviderLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
}

export class LogEmailProvider implements EmailProvider {
  readonly name = "log";
  private readonly logger: LogProviderLogger;

  constructor(logger?: LogProviderLogger) {
    this.logger =
      logger ?? {
        // eslint-disable-next-line no-console
        info: (msg, data) => console.log(`[email:log] ${msg}`, data ?? {}),
      };
  }

  async send(
    request: SendEmailRequest
  ): Promise<Result<SendEmailResponse, EmailError>> {
    this.logger.info("Email (not actually sent — log provider)", {
      to: request.to,
      subject: request.subject,
      text: request.text,
    });
    return ok({});
  }
}
