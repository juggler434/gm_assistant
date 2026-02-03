import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { createSession } from "./session.js";
import { setSessionCookie } from "./middleware.js";
import { registerBodySchema } from "./schemas.js";
import { findUserByEmail, createUser } from "./repository.js";

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
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create user",
      });
    }

    // 5. Create session
    const sessionResult = await createSession(newUser.id);
    if (!sessionResult.ok) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to create session",
      });
    }

    // 6. Set cookie and return user
    setSessionCookie(reply, sessionResult.value.token);
    return reply.status(201).send({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  });
}
