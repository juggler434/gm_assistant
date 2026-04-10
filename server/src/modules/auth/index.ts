// SPDX-License-Identifier: AGPL-3.0-or-later

// Auth types
export type { SessionToken, ValidatedSession, SessionError } from "./types.js";

// Session management
export {
  generateSessionToken,
  parseSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllUserSessions,
} from "./session.js";

// Fastify middleware and utilities
export {
  registerAuth,
  requireAuth,
  requireVerifiedEmail,
  csrfProtection,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  verifyRequestOrigin,
} from "./middleware.js";

// Routes
export { authRoutes } from "./routes.js";

// Schemas
export { registerBodySchema, type RegisterBody, forgotPasswordBodySchema, type ForgotPasswordBody, resetPasswordBodySchema, type ResetPasswordBody } from "./schemas.js";

// Repository
export { findUserByEmail, findUserById, createUser, markEmailVerified, isEmailVerified, updatePassword } from "./repository.js";

// Email verification
export {
  createVerificationToken,
  consumeVerificationToken,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from "./email-verification.js";

// Password reset
export {
  createPasswordResetToken,
  consumePasswordResetToken,
  PASSWORD_RESET_TTL_SECONDS,
} from "./password-reset.js";
