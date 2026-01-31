import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { config } from "@/config/index.js";
import { validateSessionToken, type ValidatedSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    session: ValidatedSession | null;
    userId: string | null;
  }
}

/**
 * Cookie options for session tokens.
 */
function getSessionCookieOptions(maxAge?: number) {
  const isProduction = config.env === "production";
  return {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: maxAge ?? config.session.maxAgeDays * 24 * 60 * 60, // in seconds
  };
}

/**
 * Set the session cookie on the response.
 */
export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(config.session.cookieName, token, getSessionCookieOptions());
}

/**
 * Clear the session cookie on the response.
 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.session.cookieName, {
    path: "/",
  });
}

/**
 * Get the session token from the request cookies.
 */
export function getSessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[config.session.cookieName];
}

/**
 * Auth plugin that adds session validation to all requests.
 * Decorates requests with `session` and `userId` properties.
 */
async function authPlugin(app: FastifyInstance): Promise<void> {
  // Register cookie plugin if not already registered
  if (!app.hasDecorator("cookies")) {
    const cookie = await import("@fastify/cookie");
    await app.register(cookie.default, {
      secret: config.session.secret,
      parseOptions: {},
    });
  }

  // Decorate request with session and userId
  app.decorateRequest("session", null);
  app.decorateRequest("userId", null);

  // Add preHandler hook to validate session on every request
  app.addHook("preHandler", async (request) => {
    const token = getSessionToken(request);
    if (!token) {
      request.session = null;
      request.userId = null;
      return;
    }

    const result = await validateSessionToken(token);
    if (result.ok) {
      request.session = result.value;
      request.userId = result.value.userId;
    } else {
      request.session = null;
      request.userId = null;
    }
  });
}

export const registerAuth = fp(authPlugin, {
  name: "auth",
});

/**
 * Middleware to require authentication on a route.
 * Returns 401 Unauthorized if no valid session is present.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.session || !request.userId) {
    reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required",
    });
  }
}

/**
 * Verify request origin for CSRF protection.
 * Should be used on state-changing endpoints (POST, PUT, PATCH, DELETE).
 */
export function verifyRequestOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;

  if (!origin || !host) {
    // If no origin header, this might be a same-origin request or non-browser client
    // For strict CSRF protection, you might want to reject these in production
    return config.env !== "production";
  }

  try {
    const originUrl = new globalThis.URL(origin);
    const hostUrl = new globalThis.URL(`${request.protocol}://${host}`);

    // Check if origin matches the host
    return originUrl.host === hostUrl.host;
  } catch {
    return false;
  }
}

/**
 * Middleware to verify request origin for CSRF protection.
 * Returns 403 Forbidden if origin verification fails.
 */
export async function csrfProtection(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only check for state-changing methods
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  if (!verifyRequestOrigin(request)) {
    reply.status(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Invalid request origin",
    });
  }
}
