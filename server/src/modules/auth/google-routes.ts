// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "@/config/index.js";
import { trackEvent, identifyUser } from "@/services/metrics/index.js";
import { createSession } from "./session.js";
import { setSessionCookie } from "./middleware.js";
import { recordAuthEvent } from "./audit-log.js";
import {
  findUserByEmail,
  findAuthIdentity,
  createAuthIdentity,
  createOAuthUser,
} from "./repository.js";
import {
  GOOGLE_PROVIDER,
  getGoogleOAuthConfig,
  createAuthorizationUrl,
  consumeState,
  exchangeCodeForUserInfo,
} from "./google-oauth.js";
import { findUserMfa } from "./mfa-repository.js";
import { createMfaPendingToken } from "./mfa-pending.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * Redirect to the frontend with an error banner. The login page will surface
 * the error query param. Uses appUrl so we land back at the Vite-served UI in
 * dev and the static client in prod.
 */
function redirectWithError(reply: FastifyReply, errorCode: string): FastifyReply {
  const url = new globalThis.URL("/login", config.appUrl);
  url.searchParams.set("oauth_error", errorCode);
  return reply.redirect(url.toString(), 302);
}

function redirectToApp(reply: FastifyReply, path: string): FastifyReply {
  const target = path.startsWith("/") ? path : "/";
  const url = new globalThis.URL(target, config.appUrl);
  return reply.redirect(url.toString(), 302);
}

export async function googleOAuthRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/auth/google/start — begin Google OAuth flow
  app.get(
    "/google/start",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const oauthConfig = getGoogleOAuthConfig();
      if (!oauthConfig) {
        request.log.warn("Google OAuth start requested but provider is not configured");
        return reply.status(503).send({
          statusCode: 503,
          error: "Service Unavailable",
          message: "Google sign-in is not configured",
        });
      }

      const authUrlResult = await createAuthorizationUrl(oauthConfig);
      if (!authUrlResult.ok) {
        request.log.error({ error: authUrlResult.error }, "Failed to create OAuth state");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to start Google sign-in",
        });
      }

      return reply.redirect(authUrlResult.value.url, 302);
    }
  );

  // GET /api/auth/google/callback — handle redirect back from Google
  app.get("/google/callback", async (request, reply) => {
    const oauthConfig = getGoogleOAuthConfig();
    if (!oauthConfig) {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Google sign-in is not configured",
      });
    }

    const parseResult = callbackQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return redirectWithError(reply, "invalid_request");
    }

    const { code, state, error } = parseResult.data;

    if (error) {
      request.log.info({ error }, "Google OAuth consent declined or errored");
      return redirectWithError(reply, "access_denied");
    }

    if (!code || !state) {
      return redirectWithError(reply, "invalid_request");
    }

    const stateResult = await consumeState(state);
    if (!stateResult.ok) {
      request.log.warn({ error: stateResult.error }, "OAuth state validation failed");
      return redirectWithError(reply, "invalid_state");
    }

    const exchange = await exchangeCodeForUserInfo(
      oauthConfig,
      code,
      stateResult.value.codeVerifier
    );
    if (!exchange.ok) {
      request.log.error({ error: exchange.error }, "Google token exchange failed");
      return redirectWithError(reply, "token_exchange_failed");
    }

    const google = exchange.value;
    if (!google.emailVerified) {
      request.log.warn({ email: google.email }, "Google account email not verified");
      return redirectWithError(reply, "email_not_verified");
    }

    // 1. Look up by provider identity (fast path for returning users)
    const existingIdentity = await findAuthIdentity(GOOGLE_PROVIDER, google.sub);
    let userId: string | null = null;
    let isNewUser = false;

    if (existingIdentity) {
      userId = existingIdentity.userId;
    } else {
      // 2. No identity yet — check if an existing account uses this email
      const existingByEmail = await findUserByEmail(google.email);

      if (existingByEmail) {
        // Auto-link only when the existing account has a verified email.
        // This prevents a Google sign-in from hijacking an unverified
        // password account someone else registered.
        if (existingByEmail.emailVerifiedAt) {
          const linked = await createAuthIdentity(
            existingByEmail.id,
            GOOGLE_PROVIDER,
            google.sub
          );
          if (!linked) {
            request.log.error(
              { userId: existingByEmail.id },
              "Failed to link Google identity to existing user"
            );
            return redirectWithError(reply, "link_failed");
          }
          userId = existingByEmail.id;
          recordAuthEvent({
            userId,
            eventType: "login_success",
            request,
            metadata: { provider: GOOGLE_PROVIDER, linked: true },
          });
        } else {
          request.log.info(
            { email: google.email },
            "Refusing to auto-link Google to unverified password account"
          );
          return redirectWithError(reply, "account_not_linkable");
        }
      } else {
        // 3. Brand new user — provision an OAuth-only account
        const created = await createOAuthUser({
          email: google.email,
          name: google.name,
          provider: GOOGLE_PROVIDER,
          providerAccountId: google.sub,
        });
        if (!created) {
          request.log.error({ email: google.email }, "Failed to create OAuth user");
          return redirectWithError(reply, "create_failed");
        }
        userId = created.id;
        isNewUser = true;
        identifyUser(created.id, { email: created.email, name: created.name });
        trackEvent(created.id, "user_registered", { provider: GOOGLE_PROVIDER });
        recordAuthEvent({
          userId,
          eventType: "register",
          request,
          metadata: { provider: GOOGLE_PROVIDER },
        });
      }
    }

    if (!userId) {
      return redirectWithError(reply, "unknown_error");
    }

    // If MFA is enabled, short-circuit: redirect to the login page with a
    // pending token so the user can complete the second factor.
    const mfa = await findUserMfa(userId);
    if (mfa?.enabledAt) {
      const pendingResult = await createMfaPendingToken(userId);
      if (!pendingResult.ok) {
        request.log.error(
          { error: pendingResult.error },
          "Failed to create MFA-pending token after Google sign-in"
        );
        return redirectWithError(reply, "mfa_challenge_failed");
      }
      recordAuthEvent({
        userId,
        eventType: "mfa_challenge_issued",
        request,
        metadata: { provider: GOOGLE_PROVIDER },
      });
      const mfaUrl = new globalThis.URL("/login", config.appUrl);
      mfaUrl.searchParams.set("mfa_token", pendingResult.value.token);
      if (stateResult.value.returnTo) {
        mfaUrl.searchParams.set("return_to", stateResult.value.returnTo);
      }
      return reply.redirect(mfaUrl.toString(), 302);
    }

    const sessionResult = await createSession(userId);
    if (!sessionResult.ok) {
      request.log.error(
        { error: sessionResult.error },
        "Failed to create session after Google sign-in"
      );
      return redirectWithError(reply, "session_failed");
    }

    setSessionCookie(reply, sessionResult.value.token);
    if (!isNewUser) {
      trackEvent(userId, "user_logged_in", { provider: GOOGLE_PROVIDER });
      recordAuthEvent({
        userId,
        eventType: "login_success",
        request,
        metadata: { provider: GOOGLE_PROVIDER },
      });
    }

    return redirectToApp(reply, stateResult.value.returnTo ?? "/campaigns");
  });

  // GET /api/auth/google/config — advertise whether Google sign-in is available
  app.get("/google/config", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ enabled: getGoogleOAuthConfig() !== null });
  });
}
