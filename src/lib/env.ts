/**
 * Environment validation (Zod).
 *
 * Parsed once and cached. `instrumentation.ts` calls getEnv() at server boot,
 * so a misconfigured deployment fails immediately instead of on the first
 * request. Parsing is lazy (not at import time) so `next build` — which sets
 * NODE_ENV=production but has no runtime secrets — still succeeds.
 */
import { z } from "zod";

const boolFlag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // Optional: without a key every audit is deterministic-only and labeled "AI unavailable".
    GEMINI_API_KEY: z.string().trim().min(10).optional(),
    // Verified against ListModels on 2026-10-26. 3.8-flash is Google's recommended model
    // but was frequently overloaded (503), so lighter models are tried as fallbacks.
    GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
    // Comma-separated, tried in order after the primary (max 2 are used).
    GEMINI_FALLBACK_MODEL: z
      .string()
      .default("gemini-3.1-flash-lite,gemini-3.5-flash")
      .transform((s) => s.split(",").map((m) => m.trim()).filter(Boolean)),
    // Per attempt. 3 attempts × 30s + backoff fits the route's 120s maxDuration.
    GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),

    MONGODB_URI: z
      .string()
      .trim()
      .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://")
      .optional(),
    // Explicit opt-in to the volatile in-memory store in production (e.g. a demo deploy).
    ALLOW_MEMORY_DB: boolFlag,

    // Audit creations allowed per client per window.
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(8),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(10 * 60_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.MONGODB_URI && !env.ALLOW_MEMORY_DB) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI"],
        message:
          "MONGODB_URI is required in production. Set ALLOW_MEMORY_DB=true to knowingly use the volatile in-memory store.",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse({
    ...process.env,
    // Treat empty strings (common in .env files) as unset.
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    MONGODB_URI: process.env.MONGODB_URI || undefined,
  });
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}
