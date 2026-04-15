// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

const envSchema = z
  .object({
    // Server
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3000),

    // Database
    DATABASE_URL: z
      .string()
      .startsWith("postgresql://", {
        message: "DATABASE_URL must start with postgresql://",
      })
      .optional(),

    // Redis
    REDIS_URL: z
      .string()
      .startsWith("redis://", {
        message: "REDIS_URL must start with redis://",
      })
      .optional(),

    // S3-Compatible Storage
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),

    // LLM
    LLM_PROVIDER: z.enum(["ollama", "google", "anthropic"]).default("ollama"),
    LLM_MODEL: z.string().default("gemma3:1b"),
    LLM_BASE_URL: z.string().url().default("http://localhost:11434"),
    LLM_TIMEOUT: z.coerce.number().int().positive().default(120000),
    LLM_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),

    // Ollama (always required for embeddings)
    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),

    // Google AI (Gemini)
    GOOGLE_AI_API_KEY: z.string().optional(),

    // Anthropic (Claude)
    ANTHROPIC_API_KEY: z.string().optional(),

    // Auth
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default("7d"),

    // Session
    SESSION_SECRET: z.string().optional(),
    SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
    SESSION_UPDATE_AGE_HOURS: z.coerce.number().int().positive().default(1),

    // MFA / 2FA (AES-256-GCM key for encrypting TOTP secrets at rest, 32 bytes hex)
    MFA_ENCRYPTION_KEY: z.string().optional(),

    // Google OAuth (optional — Google sign-in disabled if not set)
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

    // OCR Service
    OCR_SERVICE_URL: z.string().url().optional(),
    OCR_TIMEOUT: z.coerce.number().int().positive().default(300000),

    // Whisper (speech-to-text)
    WHISPER_BASE_URL: z.string().url().optional(),
    WHISPER_MODEL: z.string().default("base"),
    WHISPER_TIMEOUT: z.coerce.number().int().positive().default(120000),

    // Speaker Diarization (optional - speaker labels disabled if not set)
    DIARIZATION_BASE_URL: z.string().url().optional(),
    DIARIZATION_TIMEOUT: z.coerce.number().int().positive().default(120000),

    // PostHog Analytics
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().url().optional(),

    // Email (Postmark)
    EMAIL_PROVIDER: z.enum(["postmark", "log"]).default("log"),
    POSTMARK_SERVER_TOKEN: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().optional(),
    EMAIL_FROM_NAME: z.string().default("GM Assistant"),

    // Public app URL (used to build links in transactional emails)
    APP_URL: z.string().url().default("http://localhost:5173"),

    // Server
    CORS_ORIGIN: z
      .string()
      .default("http://localhost:5173")
      .transform((val) => val.split(",").map((s) => s.trim())),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    MAX_FILE_SIZE: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    // In production, require critical environment variables
    if (data.NODE_ENV === "production") {
      if (!data.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET is required in production",
          path: ["JWT_SECRET"],
        });
      } else if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET must be at least 32 characters in production",
          path: ["JWT_SECRET"],
        });
      }

      if (!data.SESSION_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SESSION_SECRET is required in production",
          path: ["SESSION_SECRET"],
        });
      } else if (data.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SESSION_SECRET must be at least 32 characters in production",
          path: ["SESSION_SECRET"],
        });
      }

      if (!data.MFA_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MFA_ENCRYPTION_KEY is required in production (64 hex chars / 32 bytes)",
          path: ["MFA_ENCRYPTION_KEY"],
        });
      } else if (!/^[0-9a-fA-F]{64}$/.test(data.MFA_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
          path: ["MFA_ENCRYPTION_KEY"],
        });
      }

      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL is required in production",
          path: ["DATABASE_URL"],
        });
      }

      if (!data.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "REDIS_URL is required in production",
          path: ["REDIS_URL"],
        });
      }

      if (data.EMAIL_PROVIDER === "postmark") {
        if (!data.POSTMARK_SERVER_TOKEN) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "POSTMARK_SERVER_TOKEN is required when EMAIL_PROVIDER=postmark",
            path: ["POSTMARK_SERVER_TOKEN"],
          });
        }
        if (!data.EMAIL_FROM_ADDRESS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "EMAIL_FROM_ADDRESS is required when EMAIL_PROVIDER=postmark",
            path: ["EMAIL_FROM_ADDRESS"],
          });
        }
      }

      if (!data.S3_ENDPOINT || !data.S3_BUCKET || !data.S3_ACCESS_KEY || !data.S3_SECRET_KEY) {
        const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"].filter(
          (key) => !data[key as keyof typeof data]
        );
        for (const key of missing) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} is required in production`,
            path: [key],
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    console.error("\n❌ Environment validation failed!\n");
    console.error(`   Detected environment: ${nodeEnv}\n`);
    console.error("   Issues:");

    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      console.error(`   • ${path}: ${issue.message}`);
    }

    console.error("\n   Please check your .env file or environment variables.\n");
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
