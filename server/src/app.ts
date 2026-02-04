import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import { config } from "@/config/index.js";
import {
  registerCors,
  registerRateLimit,
  registerMultipart,
  registerWebSocket,
  registerAuth,
} from "@/plugins/index.js";
import { authRoutes } from "@/modules/auth/index.js";
import { campaignRoutes } from "@/modules/campaigns/index.js";

export interface AppOptions {
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? config.env !== "test",
  });

  // Register plugins
  await registerCors(app);
  await registerRateLimit(app);
  await registerMultipart(app);
  await registerWebSocket(app);
  await registerAuth(app);

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    request.log.error(error);

    reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: statusCode >= 500 ? "Internal Server Error" : error.message,
    });
  });

  // Register routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(campaignRoutes, { prefix: "/api/campaigns" });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
}
