import { config } from "@/config/index.js";
import { buildApp } from "./app.js";
import { shutdownMetrics } from "@/services/metrics/index.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await shutdownMetrics();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`${config.appName} v${config.version} started`);
    app.log.info(`Environment: ${config.env}`);
    app.log.info(`Database: ${config.database.url.replace(/\/\/.*@/, "//***@")}`);
    app.log.info(`Redis: ${config.redis.url}`);
    app.log.info(`LLM: ${config.llm.model} at ${config.llm.baseUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
