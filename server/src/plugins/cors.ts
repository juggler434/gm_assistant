// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { config } from "@/config/index.js";

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: config.server.corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
