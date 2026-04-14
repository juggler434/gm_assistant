// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { createSession, invalidateSession, invalidateAllUserSessions } from "./session.js";
import { setSessionCookie, clearSessionCookie, requireAuth } from "./middleware.js";
import { registerBodySchema, loginBodySchema, verifyEmailQuerySchema, forgotPasswordBodySchema, resetPasswordBodySchema } from "./schemas.js";
import { findUserByEmail, findUserById, createUser, markEmailVerified, updatePassword } from "./repository.js";
import { trackEvent, identifyUser } from "@/services/metrics/index.js";
import { createVerificationToken, consumeVerificationToken, VERIFICATION_TOKEN_TTL_SECONDS } from "./email-verification.js";
import { createPasswordResetToken, consumePasswordResetToken, PASSWORD_RESET_TTL_SECONDS } from "./password-reset.js";
import { checkBruteForce, recordFailedAttempt, resetFailedAttempts } from "./brute-force.js";
import { getEmailService } from "@/services/email/index.js";
import { config } from "@/config/index.js";
import { recordAuthEvent } from "./audit-log.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const REGISTER_SUCCESS_MESSAGE = "Registration successful. Please check your email to verify your account.";

    // 1. Validate body with Zod
    const parseResult = registerBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message ?? "Validation failed",
      });
    }
    const { email, password, name } = parseResult.data;

    // 2. Check for existing user
    const existing = await findUserByEmail(email);
    if (existing) {
      // Perform a dummy hash to match timing of the success path
      await argon2.hash(password);

      recordAuthEvent({ userId: existing.id, eventType: "register_duplicate", request });

      // Notify the existing user (fire-and-forget)
      const emailService = getEmailService();
      emailService.sendDuplicateRegistrationEmail({ to: existing.email, recipientName: existing.name })
        .catch((error) => request.log.error({ error }, "Failed to send duplicate registration email"));

      return reply.status(201).send({ message: REGISTER_SUCCESS_MESSAGE });
    }

    // 3. Hash password with argon2
    const passwordHash = await argon2.hash(password);

    // 4. Insert user
    const newUser = await createUser({ email, passwordHash, name });
    if (!newUser) {
      request.log.error({ email }, "Failed to create user");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create user",
      });
    }

    // 5. Create session
    const sessionResult = await createSession(newUser.id);
    if (!sessionResult.ok) {
      request.log.error({ error: sessionResult.error }, "Failed to create session during registration");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create session",
      });
    }

    // 6. Set cookie
    setSessionCookie(reply, sessionResult.value.token);

    identifyUser(newUser.id, { email: newUser.email, name: newUser.name });
    trackEvent(newUser.id, "user_registered");
    recordAuthEvent({ userId: newUser.id, eventType: "register", request });

    // Send verification email (fire-and-forget — don't block registration)
    sendVerificationTokenEmail(newUser.id, newUser.email, newUser.name, request.log).catch(
      (error) => request.log.error({ error }, "Failed to send verification email after registration")
    );

    return reply.status(201).send({ message: REGISTER_SUCCESS_MESSAGE });
  });

  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    // 1. Validate body with Zod
    const parseResult = loginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message ?? "Validation failed",
      });
    }
    const { email, password } = parseResult.data;

    // 2. Check brute-force lockout for this email
    const bruteForce = await checkBruteForce(email);
    if (bruteForce.locked) {
      reply.header("Retry-After", String(bruteForce.retryAfter));
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Too many failed login attempts. Please try again later.",
      });
    }

    // 3. Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      await recordFailedAttempt(email);
      recordAuthEvent({ userId: null, eventType: "login_failure", request, metadata: { email, reason: "unknown_email" } });
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    // 4. Verify password against hash (OAuth-only accounts have no password hash)
    const passwordValid =
      user.passwordHash !== null &&
      (await argon2.verify(user.passwordHash, password));
    if (!passwordValid) {
      await recordFailedAttempt(email);
      recordAuthEvent({ userId: user.id, eventType: "login_failure", request, metadata: { reason: "invalid_password" } });
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    // 5. Successful login — reset brute-force counter
    await resetFailedAttempts(email);

    // 6. Create new session
    const sessionResult = await createSession(user.id);
    if (!sessionResult.ok) {
      request.log.error({ error: sessionResult.error }, "Failed to create session during login");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create session",
      });
    }

    // 7. Set cookie and return user
    setSessionCookie(reply, sessionResult.value.token);

    trackEvent(user.id, "user_logged_in");
    recordAuthEvent({ userId: user.id, eventType: "login_success", request });

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerifiedAt !== null,
      },
    });
  });

  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await findUserById(request.userId!);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "User not found",
      });
    }

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerifiedAt !== null,
      },
    });
  });

  app.post("/logout", { preHandler: [requireAuth] }, async (request, reply) => {
    if (request.session) {
      await invalidateSession(request.session.id);
    }
    clearSessionCookie(reply);
    recordAuthEvent({ userId: request.userId, eventType: "logout", request });

    return reply.status(200).send({ message: "Logged out" });
  });

  // GET /api/auth/verify-email?token=... — consume verification token
  app.get("/verify-email", async (request, reply) => {
    const parseResult = verifyEmailQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Missing or invalid token",
      });
    }

    const { token } = parseResult.data;
    const consumeResult = await consumeVerificationToken(token);

    if (!consumeResult.ok) {
      if (consumeResult.error.code === "TOKEN_NOT_FOUND") {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired verification link",
        });
      }
      request.log.error({ error: consumeResult.error }, "Failed to consume verification token");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to verify email",
      });
    }

    const userId = consumeResult.value;
    const user = await markEmailVerified(userId);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "User not found",
      });
    }

    trackEvent(userId, "email_verified");

    return reply.status(200).send({
      message: "Email verified successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    });
  });

  // POST /api/auth/resend-verification — resend the verification email
  app.post(
    "/resend-verification",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "15 minutes",
        },
      },
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

      if (user.emailVerifiedAt) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Email is already verified",
        });
      }

      const sendResult = await sendVerificationTokenEmail(
        user.id,
        user.email,
        user.name,
        request.log
      );

      if (!sendResult.ok) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to send verification email",
        });
      }

      return reply.status(200).send({
        message: "Verification email sent",
      });
    }
  );

  // POST /api/auth/forgot-password — request a password reset email
  app.post(
    "/forgot-password",
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const parseResult = forgotPasswordBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Validation failed",
        });
      }
      const { email } = parseResult.data;

      // Always return the same response to prevent email enumeration.
      const genericMessage =
        "If an account with that email exists, we sent a password reset link.";

      // Fire-and-forget: create token + send email in background.
      const user = await findUserByEmail(email);
      if (user) {
        sendPasswordResetEmail(user.id, user.email, user.name, request.log).catch((error) =>
          request.log.error({ error }, "Failed to send password reset email")
        );
        recordAuthEvent({ userId: user.id, eventType: "password_reset_request", request });
      }

      return reply.status(200).send({ message: genericMessage });
    }
  );

  // POST /api/auth/reset-password — consume token and set new password
  app.post(
    "/reset-password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const parseResult = resetPasswordBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Validation failed",
        });
      }
      const { token, password } = parseResult.data;

      const consumeResult = await consumePasswordResetToken(token);
      if (!consumeResult.ok) {
        if (consumeResult.error.code === "TOKEN_NOT_FOUND") {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Invalid or expired reset link",
          });
        }
        request.log.error({ error: consumeResult.error }, "Failed to consume password reset token");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to reset password",
        });
      }

      const userId = consumeResult.value;
      const passwordHash = await argon2.hash(password);
      const user = await updatePassword(userId, passwordHash);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      // Invalidate all sessions so the user (and any attacker) must re-authenticate.
      await invalidateAllUserSessions(userId);

      trackEvent(userId, "password_reset");
      recordAuthEvent({ userId, eventType: "password_reset_complete", request });
      recordAuthEvent({ userId, eventType: "sessions_invalidated", request, metadata: { reason: "password_reset" } });

      return reply.status(200).send({ message: "Password reset successfully" });
    }
  );
}

/**
 * Generate a verification token and send the verification email.
 */
async function sendVerificationTokenEmail(
  userId: string,
  email: string,
  name: string,
  log: { error: (obj: Record<string, unknown>, msg: string) => void }
): Promise<{ ok: boolean }> {
  const tokenResult = await createVerificationToken(userId, VERIFICATION_TOKEN_TTL_SECONDS);
  if (!tokenResult.ok) {
    log.error({ error: tokenResult.error }, "Failed to create verification token");
    return { ok: false };
  }

  const { token, expiresAt } = tokenResult.value;
  const verificationUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

  const emailService = getEmailService();
  const emailResult = await emailService.sendVerificationEmail({
    to: email,
    recipientName: name,
    verificationUrl,
    expiresAt,
  });

  if (!emailResult.ok) {
    log.error(
      { error: { code: emailResult.error.code, message: emailResult.error.message } },
      "Failed to send verification email"
    );
    return { ok: false };
  }

  return { ok: true };
}

/**
 * Generate a password reset token and send the reset email.
 */
async function sendPasswordResetEmail(
  userId: string,
  email: string,
  name: string,
  log: { error: (obj: Record<string, unknown>, msg: string) => void }
): Promise<{ ok: boolean }> {
  const tokenResult = await createPasswordResetToken(userId, PASSWORD_RESET_TTL_SECONDS);
  if (!tokenResult.ok) {
    log.error({ error: tokenResult.error }, "Failed to create password reset token");
    return { ok: false };
  }

  const { token, expiresAt } = tokenResult.value;
  const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const emailService = getEmailService();
  const emailResult = await emailService.sendPasswordResetEmail({
    to: email,
    recipientName: name,
    resetUrl,
    expiresAt,
  });

  if (!emailResult.ok) {
    log.error(
      { error: { code: emailResult.error.code, message: emailResult.error.message } },
      "Failed to send password reset email"
    );
    return { ok: false };
  }

  return { ok: true };
}
