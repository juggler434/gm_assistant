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

    // LLM
    LLM_MODEL: z.string().default("llama3"),
    LLM_BASE_URL: z.string().url().default("http://localhost:11434"),

    // Auth
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default("7d"),

    // Storage
    UPLOAD_DIR: z.string().default("./uploads"),
    MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(50),
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

      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL is required in production",
          path: ["DATABASE_URL"],
        });
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
