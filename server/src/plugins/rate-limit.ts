import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config } from "@/config/index.js";

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: config.server.rateLimit.max,
    timeWindow: config.server.rateLimit.timeWindow,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    }),
  });
}
