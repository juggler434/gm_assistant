// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import { authRoutes, googleOAuthRoutes, csrfProtection } from "@/modules/auth/index.js";
import { campaignRoutes } from "@/modules/campaigns/index.js";
import { documentRoutes } from "@/modules/documents/index.js";
import { generationRoutes } from "@/modules/generation/index.js";
import { queryRoutes } from "@/modules/query/index.js";
import { npcRoutes } from "@/modules/npcs/index.js";
import { locationRoutes } from "@/modules/locations/index.js";
import { adventureHookRoutes } from "@/modules/adventure-hooks/index.js";
import { adventureOutlineRoutes } from "@/modules/adventure-outlines/index.js";
import { adventureRoutes } from "@/modules/adventures/index.js";
import { conversationRoutes } from "@/modules/conversations/index.js";
import { sessionRoutes } from "@/modules/sessions/index.js";
import { transcriptionRoutes } from "@/modules/transcription/index.js";
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

  // CSRF protection: reject state-changing /api requests with a foreign Origin.
  // No-op for GET/HEAD/OPTIONS and for routes outside /api/.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }
    await csrfProtection(request, reply);
  });

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
  await app.register(googleOAuthRoutes, { prefix: "/api/auth" });
  await app.register(campaignRoutes, { prefix: "/api/campaigns" });
  await app.register(documentRoutes, { prefix: "/api/campaigns" });
  await app.register(generationRoutes, { prefix: "/api/campaigns" });
  await app.register(npcRoutes, { prefix: "/api/campaigns" });
  await app.register(locationRoutes, { prefix: "/api/campaigns" });
  await app.register(adventureHookRoutes, { prefix: "/api/campaigns" });
  await app.register(adventureOutlineRoutes, { prefix: "/api/campaigns" });
  await app.register(adventureRoutes, { prefix: "/api/campaigns" });
  await app.register(queryRoutes, { prefix: "/api/campaigns" });
  await app.register(conversationRoutes, { prefix: "/api/campaigns" });
  await app.register(sessionRoutes, { prefix: "/api/campaigns" });
  await app.register(transcriptionRoutes, { prefix: "/api/campaigns" });
  await app.register(metricsRoutes, { prefix: "/api/admin/metrics" });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // In production, serve client static files
  if (config.env === "production") {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDistPath = path.resolve(__dirname, "../../client/dist");

    if (existsSync(clientDistPath)) {
      const fastifyStatic = await import("@fastify/static");
      await app.register(fastifyStatic.default, {
        root: clientDistPath,
        prefix: "/",
        wildcard: false,
      });

      // SPA fallback: serve index.html for non-API routes
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/api/")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Route not found",
          });
        }
        return reply.sendFile("index.html");
      });

      app.log.info(`Serving client from ${clientDistPath}`);
    }
  }

  app.log.info("Routes registered");

  return app;
}
