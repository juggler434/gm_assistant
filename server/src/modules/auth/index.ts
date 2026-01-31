// Session management
export {
  generateSessionToken,
  parseSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllUserSessions,
  cleanupExpiredSessions,
  type SessionToken,
  type ValidatedSession,
  type SessionError,
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
