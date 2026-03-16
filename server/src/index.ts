// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from "@/config/index.js";
import { buildApp } from "./app.js";
import { shutdownMetrics } from "@/services/metrics/index.js";
import { createWorker } from "@/jobs/index.js";
import { handleDocumentIndexing, type DocumentIndexingJobData } from "@/jobs/document-indexing.js";
import { handleSessionTranscription, type SessionTranscriptionJobData } from "@/jobs/session-transcription.js";
import { closeActiveSessions } from "@/modules/transcription/index.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // Start the document indexing worker
  const worker = createWorker<DocumentIndexingJobData, void>(
    "document-indexing",
    handleDocumentIndexing,
    {
      lockDuration: 300_000,
      stalledInterval: 300_000,
      logger: {
        debug: (msg, meta) => app.log.debug(meta, msg),
        info: (msg, meta) => app.log.info(meta, msg),
        warn: (msg, meta) => app.log.warn(meta, msg),
        error: (msg, meta) => app.log.error(meta, msg),
      },
    }
  );

  // Start the session transcription worker
  const transcriptionWorker = createWorker<SessionTranscriptionJobData, void>(
    "session-transcription",
    handleSessionTranscription,
    {
      lockDuration: 600_000,
      stalledInterval: 600_000,
      logger: {
        debug: (msg, meta) => app.log.debug(meta, msg),
        info: (msg, meta) => app.log.info(meta, msg),
        warn: (msg, meta) => app.log.warn(meta, msg),
        error: (msg, meta) => app.log.error(meta, msg),
      },
    }
  );

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await closeActiveSessions();
    await worker.shutdown();
    await transcriptionWorker.shutdown();
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
    app.log.info("Document indexing worker started");
    app.log.info("Session transcription worker started");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
