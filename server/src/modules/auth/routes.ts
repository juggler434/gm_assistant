// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { createSession, invalidateSession } from "./session.js";
import { setSessionCookie, clearSessionCookie, requireAuth } from "./middleware.js";
import { registerBodySchema, loginBodySchema } from "./schemas.js";
import { findUserByEmail, findUserById, createUser } from "./repository.js";
import { trackEvent, identifyUser } from "@/services/metrics/index.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", async (request, reply) => {
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
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Email already registered",
      });
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

    // 6. Set cookie and return user
    setSessionCookie(reply, sessionResult.value.token);

    identifyUser(newUser.id, { email: newUser.email, name: newUser.name });
    trackEvent(newUser.id, "user_registered");

    return reply.status(201).send({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  });

  app.post("/login", async (request, reply) => {
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

    // 2. Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    // 3. Verify password against hash
    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    // 4. Create new session
    const sessionResult = await createSession(user.id);
    if (!sessionResult.ok) {
      request.log.error({ error: sessionResult.error }, "Failed to create session during login");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create session",
      });
    }

    // 5. Set cookie and return user
    setSessionCookie(reply, sessionResult.value.token);

    trackEvent(user.id, "user_logged_in");

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
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
      },
    });
  });

  app.post("/logout", { preHandler: [requireAuth] }, async (request, reply) => {
    if (request.session) {
      await invalidateSession(request.session.id);
    }
    clearSessionCookie(reply);

    return reply.status(200).send({ message: "Logged out" });
  });
}
