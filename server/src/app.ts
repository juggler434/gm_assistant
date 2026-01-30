import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import { config } from "@/config/index.js";
import {
  registerCors,
  registerRateLimit,
  registerMultipart,
  registerWebSocket,
} from "@/plugins/index.js";

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

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
}
