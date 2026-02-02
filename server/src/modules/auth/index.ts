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
  cleanupExpiredSessions,
} from "./session.js";

// Fastify middleware and utilities
export {
  registerAuth,
  requireAuth,
  csrfProtection,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  verifyRequestOrigin,
} from "./middleware.js";
