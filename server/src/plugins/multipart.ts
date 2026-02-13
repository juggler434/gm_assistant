import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { config } from "@/config/index.js";

export async function registerMultipart(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      ...(config.server.maxFileSize
        ? { fileSize: config.server.maxFileSize }
        : {}),
      files: 10,
    },
  });
}
