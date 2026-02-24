// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from "./env.js";

export const config = {
  appName: "GM Assistant",
  version: "0.1.0",
  env: env.NODE_ENV,
  port: env.PORT,
  database: {
    url: env.DATABASE_URL ?? "postgresql://gm_user:gm_password@localhost:5432/gm_assistant",
  },
  redis: {
    url: env.REDIS_URL ?? "redis://localhost:6379",
  },
  s3: {
    endpoint: env.S3_ENDPOINT ?? "http://localhost:9000",
    bucket: env.S3_BUCKET ?? "gm-assistant",
    accessKey: env.S3_ACCESS_KEY ?? "minio_admin",
    secretKey: env.S3_SECRET_KEY ?? "minio_password",
  },
  llm: {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL,
    timeout: env.LLM_TIMEOUT,
    maxTokens: env.LLM_MAX_TOKENS,
    temperature: env.LLM_TEMPERATURE,
  },
  googleAi: {
    apiKey: env.GOOGLE_AI_API_KEY,
  },
  auth: {
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-in-production",
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
  session: {
    secret: env.SESSION_SECRET ?? "dev-session-secret-change-in-production",
    maxAgeDays: env.SESSION_MAX_AGE_DAYS,
    updateAgeHours: env.SESSION_UPDATE_AGE_HOURS,
    cookieName: "session_token",
  },
  ocr: {
    serviceUrl: env.OCR_SERVICE_URL,
    timeout: env.OCR_TIMEOUT,
  },
  posthog: {
    apiKey: env.POSTHOG_API_KEY,
    host: env.POSTHOG_HOST,
  },
  server: {
    corsOrigin: env.CORS_ORIGIN,
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
    },
    maxFileSize: env.MAX_FILE_SIZE,
  },
} as const;

export type Config = typeof config;
