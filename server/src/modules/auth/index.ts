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
  csrfProtection,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  verifyRequestOrigin,
} from "./middleware.js";

// Routes
export { authRoutes } from "./routes.js";

// Schemas
export { registerBodySchema, type RegisterBody } from "./schemas.js";

// Repository
export { findUserByEmail, findUserById, createUser } from "./repository.js";
