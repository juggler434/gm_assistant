// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash, randomBytes } from "node:crypto";
import type { Redis as RedisType } from "ioredis";
import { createRedisConnection } from "@/jobs/connection.js";
import { config } from "@/config/index.js";
import { ok, err, type Result } from "@/types/index.js";

export const GOOGLE_PROVIDER = "google";
const OAUTH_STATE_PREFIX = "oauth:google:state:";
const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 minutes

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

interface StoredState {
  codeVerifier: string;
  returnTo?: string | undefined;
  createdAt: string;
}

let oauthRedis: RedisType | null = null;

function getOauthRedis(): RedisType {
  if (!oauthRedis) {
    oauthRedis = createRedisConnection(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
  }
  return oauthRedis;
}

/**
 * Return Google OAuth config if all three env vars are set, otherwise null.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const { clientId, clientSecret, redirectUri } = config.googleOauth;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate a cryptographically random URL-safe string.
 */
function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * PKCE: SHA-256 hash the verifier, then base64url-encode.
 */
function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Create a new OAuth state (with PKCE verifier) and store it in Redis.
 * Returns the state token (sent to Google) and the authorization URL.
 */
export async function createAuthorizationUrl(
  oauthConfig: GoogleOAuthConfig,
  returnTo?: string
): Promise<Result<{ url: string; state: string }, { code: "REDIS_ERROR"; cause: unknown }>> {
  try {
    const state = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(32);
    const codeChallenge = codeChallengeFromVerifier(codeVerifier);

    const stored: StoredState = {
      codeVerifier,
      returnTo,
      createdAt: new Date().toISOString(),
    };

    const redis = getOauthRedis();
    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify(stored),
      "EX",
      OAUTH_STATE_TTL_SECONDS
    );

    const params = new globalThis.URLSearchParams({
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
    });

    return ok({ url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state });
  } catch (cause) {
    return err({ code: "REDIS_ERROR", cause });
  }
}

/**
 * Consume an OAuth state token: look up + atomically delete from Redis.
 * Returns the stored verifier + returnTo if the state is valid.
 */
export async function consumeState(
  state: string
): Promise<
  Result<
    { codeVerifier: string; returnTo?: string | undefined },
    { code: "STATE_NOT_FOUND" } | { code: "REDIS_ERROR"; cause: unknown }
  >
> {
  try {
    const redis = getOauthRedis();
    const key = `${OAUTH_STATE_PREFIX}${state}`;
    const data = await redis.get(key);
    if (!data) {
      return err({ code: "STATE_NOT_FOUND" });
    }
    await redis.del(key);
    const parsed: StoredState = JSON.parse(data);
    return ok({ codeVerifier: parsed.codeVerifier, returnTo: parsed.returnTo });
  } catch (cause) {
    return err({ code: "REDIS_ERROR", cause });
  }
}

/**
 * Exchange an authorization code for tokens, then fetch userinfo.
 */
export async function exchangeCodeForUserInfo(
  oauthConfig: GoogleOAuthConfig,
  code: string,
  codeVerifier: string
): Promise<
  Result<
    GoogleUserInfo,
    | { code: "TOKEN_EXCHANGE_FAILED"; status: number; body: string }
    | { code: "USERINFO_FAILED"; status: number; body: string }
    | { code: "INVALID_USERINFO"; message: string }
    | { code: "NETWORK_ERROR"; cause: unknown }
  >
> {
  try {
    const tokenBody = new globalThis.URLSearchParams({
      grant_type: "authorization_code",
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      redirect_uri: oauthConfig.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      return err({
        code: "TOKEN_EXCHANGE_FAILED",
        status: tokenResponse.status,
        body,
      });
    }

    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return err({
        code: "TOKEN_EXCHANGE_FAILED",
        status: tokenResponse.status,
        body: "access_token missing from response",
      });
    }

    const userinfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userinfoResponse.ok) {
      const body = await userinfoResponse.text();
      return err({
        code: "USERINFO_FAILED",
        status: userinfoResponse.status,
        body,
      });
    }

    const userinfo = (await userinfoResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
    };

    if (!userinfo.sub || !userinfo.email) {
      return err({
        code: "INVALID_USERINFO",
        message: "Google userinfo missing sub or email",
      });
    }

    return ok({
      sub: userinfo.sub,
      email: userinfo.email.toLowerCase(),
      emailVerified: userinfo.email_verified === true,
      name: userinfo.name ?? userinfo.given_name ?? userinfo.email,
    });
  } catch (cause) {
    return err({ code: "NETWORK_ERROR", cause });
  }
}
