import { config } from "@/config/index.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`${config.appName} v${config.version} started`);
    app.log.info(`Environment: ${config.env}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
