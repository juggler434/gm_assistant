export const config = {
  appName: "GM Assistant",
  version: "0.1.0",
  env: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  database: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/gm_assistant",
  },
  llm: {
    model: process.env.LLM_MODEL ?? "llama3",
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434",
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },
  storage: {
    uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? "50", 10),
  },
} as const;

export type Config = typeof config;
