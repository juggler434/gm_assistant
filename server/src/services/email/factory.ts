// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Email service factory.
 *
 * Picks a provider based on `EMAIL_PROVIDER`. Postmark is the production
 * provider; the "log" provider just writes to stdout and is used in
 * development and tests so the verification flow runs end-to-end without
 * a real Postmark account.
 */

import { config } from "@/config/index.js";
import { EmailService, type EmailServiceOptions } from "./service.js";
import { PostmarkProvider, LogEmailProvider } from "./providers/index.js";

let cachedService: EmailService | null = null;

export function createEmailService(options?: EmailServiceOptions): EmailService {
  if (config.email.provider === "postmark") {
    if (!config.email.postmarkServerToken || !config.email.fromAddress) {
      throw new Error(
        "Postmark email provider requires POSTMARK_SERVER_TOKEN and EMAIL_FROM_ADDRESS"
      );
    }
    const provider = new PostmarkProvider({
      serverToken: config.email.postmarkServerToken,
      fromAddress: config.email.fromAddress,
      fromName: config.email.fromName,
    });
    return new EmailService(provider, options);
  }

  return new EmailService(new LogEmailProvider(), options);
}

/**
 * Lazily-instantiated singleton. Routes use this so we don't construct a
 * provider per request.
 */
export function getEmailService(): EmailService {
  if (!cachedService) {
    cachedService = createEmailService();
  }
  return cachedService;
}

/** Test-only: reset the singleton between tests. */
export function __resetEmailServiceForTests(): void {
  cachedService = null;
}
