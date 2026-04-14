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
export { googleOAuthRoutes } from "./google-routes.js";

// Schemas
export { registerBodySchema, type RegisterBody, forgotPasswordBodySchema, type ForgotPasswordBody, resetPasswordBodySchema, type ResetPasswordBody } from "./schemas.js";

// Repository
export {
  findUserByEmail,
  findUserById,
  createUser,
  markEmailVerified,
  isEmailVerified,
  updatePassword,
  findAuthIdentity,
  createAuthIdentity,
  createOAuthUser,
} from "./repository.js";

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

// Audit log
export { recordAuthEvent, purgeOldAuthEvents } from "./audit-log.js";

// Brute-force protection
export {
  checkBruteForce,
  recordFailedAttempt,
  resetFailedAttempts,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_SECONDS,
} from "./brute-force.js";
