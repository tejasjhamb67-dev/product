import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),

  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 bytes hex (openssl rand -hex 32)"),
  SESSION_SIGNING_KEY: z.string().min(32),

  ANTHROPIC_API_KEY: z.string().min(1),
  BRIEF_MODEL: z.string().default("claude-sonnet-5"),

  KITE_API_KEY: z.string().min(1),
  KITE_API_SECRET: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  RAZORPAY_PLAN_ID_CORE: z.string().default(""),
  RAZORPAY_PLAN_ID_PRO: z.string().default(""),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
