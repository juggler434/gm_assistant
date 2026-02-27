// SPDX-License-Identifier: AGPL-3.0-or-later

import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import { config } from "@/config/index.js";
import {
  registerCors,
  registerRateLimit,
  registerMultipart,
  registerWebSocket,
  registerAuth,
} from "@/plugins/index.js";
import { registerMetrics } from "@/plugins/metrics.js";
import { authRoutes } from "@/modules/auth/index.js";
import { campaignRoutes } from "@/modules/campaigns/index.js";
import { documentRoutes } from "@/modules/documents/index.js";
import { generationRoutes } from "@/modules/generation/index.js";
import { queryRoutes } from "@/modules/query/index.js";
import { npcRoutes } from "@/modules/npcs/index.js";
import { conversationRoutes } from "@/modules/conversations/index.js";
import { metricsRoutes } from "@/modules/metrics/routes.js";

export interface AppOptions {
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger !== undefined
        ? options.logger
        : config.env === "test"
          ? false
          : config.env === "development"
            ? {
                transport: {
                  target: "pino-pretty",
                  options: {
                    translateTime: "HH:MM:ss",
                    ignore: "pid,hostname",
                  },
                },
              }
            : true,
  });

  // Register plugins
  await registerCors(app);
  await registerRateLimit(app);
  await registerMultipart(app);
  await registerWebSocket(app);
  await registerAuth(app);
  await registerMetrics(app);
  app.log.info("Plugins registered");

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
  await app.register(documentRoutes, { prefix: "/api/campaigns" });
  await app.register(generationRoutes, { prefix: "/api/campaigns" });
  await app.register(npcRoutes, { prefix: "/api/campaigns" });
  await app.register(queryRoutes, { prefix: "/api/campaigns" });
  await app.register(conversationRoutes, { prefix: "/api/campaigns" });
  await app.register(metricsRoutes, { prefix: "/api/admin/metrics" });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.log.info("Routes registered");

  return app;
}
