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
  ollama: {
    baseUrl: env.OLLAMA_BASE_URL,
  },
  googleAi: {
    apiKey: env.GOOGLE_AI_API_KEY,
  },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
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
  mfa: {
    // 32 bytes hex. A dev-only default so tests and local dev don't need to set it.
    encryptionKey:
      env.MFA_ENCRYPTION_KEY ??
      "0000000000000000000000000000000000000000000000000000000000000000",
    issuer: "GM Assistant",
  },
  googleOauth: {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  },
  ocr: {
    serviceUrl: env.OCR_SERVICE_URL,
    timeout: env.OCR_TIMEOUT,
  },
  whisper: {
    baseUrl: env.WHISPER_BASE_URL,
    model: env.WHISPER_MODEL,
    timeout: env.WHISPER_TIMEOUT,
  },
  diarization: {
    baseUrl: env.DIARIZATION_BASE_URL,
    timeout: env.DIARIZATION_TIMEOUT,
  },
  posthog: {
    apiKey: env.POSTHOG_API_KEY,
    host: env.POSTHOG_HOST,
  },
  email: {
    provider: env.EMAIL_PROVIDER,
    postmarkServerToken: env.POSTMARK_SERVER_TOKEN,
    fromAddress: env.EMAIL_FROM_ADDRESS,
    fromName: env.EMAIL_FROM_NAME,
  },
  appUrl: env.APP_URL,
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
