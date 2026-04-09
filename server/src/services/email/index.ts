// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Email Service Public API
 */

// Factory
export { createEmailService, getEmailService } from "./factory.js";

// Service
export { EmailService, type VerificationEmailContext } from "./service.js";

// Types
export { EmailError, type EmailErrorCode, type SendEmailRequest, type SendEmailResponse } from "./types.js";

// Providers (for advanced usage / testing)
export type { EmailProvider } from "./providers/index.js";
export { PostmarkProvider } from "./providers/index.js";
export { LogEmailProvider } from "./providers/index.js";
