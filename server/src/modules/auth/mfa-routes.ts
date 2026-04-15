// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { requireAuth, setSessionCookie } from "./middleware.js";
import { findUserById } from "./repository.js";
import {
  mfaEnableBodySchema,
  mfaLoginBodySchema,
  mfaDisableBodySchema,
} from "./schemas.js";
import {
  findUserMfa,
  upsertPendingSecret,
  enableMfa,
  disableMfa,
  consumeRecoveryCodeHash,
} from "./mfa-repository.js";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./mfa.js";
import { consumeMfaPendingToken } from "./mfa-pending.js";
import { createSession } from "./session.js";
import { recordAuthEvent } from "./audit-log.js";
import { trackEvent } from "@/services/metrics/index.js";

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/mfa/setup
   * Generate (or regenerate) a TOTP secret for the logged-in user.
   * Returns the otpauth:// URI and base32 secret so the client can render a QR.
   * The secret is stored in a pending state — enable must still be called.
   */
  app.post(
    "/mfa/setup",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const user = await findUserById(userId);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const existing = await findUserMfa(userId);
      if (existing?.enabledAt) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "MFA is already enabled. Disable it before re-enrolling.",
        });
      }

      const secret = generateTotpSecret();
      const secretEncrypted = encryptSecret(secret);
      const stored = await upsertPendingSecret(userId, secretEncrypted);
      if (!stored) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to store MFA secret",
        });
      }

      const otpauthUri = buildOtpAuthUri({ secret, accountName: user.email });

      recordAuthEvent({ userId, eventType: "mfa_setup_started", request });

      return reply.status(200).send({
        secret,
        otpauthUri,
      });
    }
  );

  /**
   * POST /api/auth/mfa/enable
   * Confirm the pending secret with a TOTP code. On success, generate and
   * return the one-time recovery codes.
   */
  app.post(
    "/mfa/enable",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const parseResult = mfaEnableBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Validation failed",
        });
      }
      const { code } = parseResult.data;

      const userId = request.userId!;
      const mfa = await findUserMfa(userId);
      if (!mfa) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Run /mfa/setup before enabling",
        });
      }
      if (mfa.enabledAt) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "MFA is already enabled",
        });
      }

      const decryptResult = decryptSecret(mfa.secretEncrypted);
      if (!decryptResult.ok) {
        request.log.error({ error: decryptResult.error }, "Failed to decrypt MFA secret");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to verify code",
        });
      }

      if (!verifyTotp(decryptResult.value, code)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid TOTP code",
        });
      }

      const { plaintext, hashed } = generateRecoveryCodes();
      const enabled = await enableMfa(userId, hashed);
      if (!enabled) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to enable MFA",
        });
      }

      trackEvent(userId, "mfa_enabled");
      recordAuthEvent({ userId, eventType: "mfa_enabled", request });

      return reply.status(200).send({
        message: "MFA enabled",
        recoveryCodes: plaintext,
      });
    }
  );

  /**
   * POST /api/auth/mfa/disable
   * Require the current password AND a valid TOTP (or recovery) code.
   */
  app.post(
    "/mfa/disable",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const parseResult = mfaDisableBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Validation failed",
        });
      }
      const { password, code } = parseResult.data;

      const userId = request.userId!;
      const user = await findUserById(userId);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const passwordValid =
        user.passwordHash !== null && (await argon2.verify(user.passwordHash, password));
      if (!passwordValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      const mfa = await findUserMfa(userId);
      if (!mfa?.enabledAt) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "MFA is not enabled",
        });
      }

      const verified = await verifyMfaCode(userId, mfa.secretEncrypted, code, request.log);
      if (!verified.ok) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid code",
        });
      }

      const removed = await disableMfa(userId);
      if (!removed) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to disable MFA",
        });
      }

      trackEvent(userId, "mfa_disabled");
      recordAuthEvent({ userId, eventType: "mfa_disabled", request });

      return reply.status(200).send({ message: "MFA disabled" });
    }
  );

  /**
   * POST /api/auth/login/mfa
   * Second factor after password verification. Consumes the mfa-pending
   * token and, on success, issues the real session cookie.
   */
  app.post(
    "/login/mfa",
    {
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const parseResult = mfaLoginBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Validation failed",
        });
      }
      const { mfaToken, code } = parseResult.data;

      const consumeResult = await consumeMfaPendingToken(mfaToken);
      if (!consumeResult.ok) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired MFA challenge",
        });
      }
      const userId = consumeResult.value;

      const mfa = await findUserMfa(userId);
      if (!mfa?.enabledAt) {
        // Should not happen if login issued the token correctly.
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "MFA is not enabled",
        });
      }

      const verified = await verifyMfaCode(userId, mfa.secretEncrypted, code, request.log);
      if (!verified.ok) {
        recordAuthEvent({
          userId,
          eventType: "mfa_challenge_failure",
          request,
          metadata: { reason: verified.reason },
        });
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid code",
        });
      }

      if (verified.viaRecoveryCode) {
        recordAuthEvent({ userId, eventType: "mfa_recovery_used", request });
      }
      recordAuthEvent({ userId, eventType: "mfa_challenge_success", request });

      const sessionResult = await createSession(userId);
      if (!sessionResult.ok) {
        request.log.error({ error: sessionResult.error }, "Failed to create session after MFA");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create session",
        });
      }

      setSessionCookie(reply, sessionResult.value.token);

      const user = await findUserById(userId);
      trackEvent(userId, "user_logged_in");
      recordAuthEvent({ userId, eventType: "login_success", request, metadata: { mfa: true } });

      return reply.status(200).send({
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerifiedAt !== null,
              mfaEnabled: true,
            }
          : null,
      });
    }
  );
}

type MfaVerifyResult =
  | { ok: true; viaRecoveryCode: boolean }
  | { ok: false; reason: "invalid_totp" | "invalid_recovery" | "decrypt_failed" };

/**
 * Verify a TOTP code, falling back to consuming a recovery code if the
 * input looks like one. Recovery codes are single-use.
 */
async function verifyMfaCode(
  userId: string,
  secretEncrypted: string,
  rawCode: string,
  log: { error: (obj: Record<string, unknown>, msg: string) => void }
): Promise<MfaVerifyResult> {
  const trimmed = rawCode.trim();
  const digitsOnly = trimmed.replace(/\s+/g, "");

  if (/^\d{6}$/.test(digitsOnly)) {
    const decrypted = decryptSecret(secretEncrypted);
    if (!decrypted.ok) {
      log.error({ error: decrypted.error }, "Failed to decrypt MFA secret");
      return { ok: false, reason: "decrypt_failed" };
    }
    if (verifyTotp(decrypted.value, digitsOnly)) {
      return { ok: true, viaRecoveryCode: false };
    }
    return { ok: false, reason: "invalid_totp" };
  }

  // Recovery-code path.
  const hash = hashRecoveryCode(normalizeRecoveryCode(trimmed));
  const consumed = await consumeRecoveryCodeHash(userId, hash);
  if (consumed) {
    return { ok: true, viaRecoveryCode: true };
  }
  return { ok: false, reason: "invalid_recovery" };
}
