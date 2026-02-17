// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { config } from "@/config/index.js";

export async function registerMultipart(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: config.server.maxFileSize ?? Infinity,
      files: 10,
    },
  });
}
