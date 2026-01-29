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
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-in-production",
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
} as const;

export type Config = typeof config;
