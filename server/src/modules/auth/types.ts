// SPDX-License-Identifier: AGPL-3.0-or-later

/** Session token format: <sessionId>.<sessionSecret> */
export interface SessionToken {
  sessionId: string;
  secret: string;
  token: string;
}

/** Session with associated user ID */
export interface ValidatedSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastVerifiedAt: Date;
}

/** Error types for session operations */
export type SessionError =
  | { code: "INVALID_TOKEN_FORMAT" }
  | { code: "SESSION_NOT_FOUND" }
  | { code: "SESSION_EXPIRED" }
  | { code: "INVALID_SECRET" }
  | { code: "DATABASE_ERROR"; cause: unknown };
