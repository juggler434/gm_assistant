import { env } from "./env.js";

export const config = {
  appName: "GM Assistant",
  version: "0.1.0",
  env: env.NODE_ENV,
  port: env.PORT,
  database: {
    url: env.DATABASE_URL ?? "postgresql://localhost:5432/gm_assistant",
  },
  llm: {
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-in-production",
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
  storage: {
    uploadDir: env.UPLOAD_DIR,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
  },
} as const;

export type Config = typeof config;
