// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Result } from "@/types/index.js";
import type {
  SendEmailRequest,
  SendEmailResponse,
  EmailError,
} from "../types.js";

export interface EmailProvider {
  /** Provider name (e.g., "postmark", "log"). */
  readonly name: string;

  /** Send a transactional email. */
  send(
    request: SendEmailRequest
  ): Promise<Result<SendEmailResponse, EmailError>>;
}
