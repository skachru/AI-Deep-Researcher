import { z } from "zod";

const ServerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  LUMEN_MODEL: z.string().default("claude-opus-5-5"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Validates server environment variables on first use and fails fast with a
 * readable message. Called lazily so `next build` works without secrets.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Public flag, inlined at build time by Next.js. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
