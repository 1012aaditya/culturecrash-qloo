import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once. Secrets never use the NEXT_PUBLIC_ prefix
 * and are only read here.
 */
const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  AUTH_MODE: z.enum(["supabase", "local"]).default("supabase"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("brief-documents"),
  SESSION_SECRET: z.string().min(32).optional(),
  QLOO_API_KEY: z.string().min(8).optional(),
  QLOO_API_URL: z.string().url().default("https://hackathon.api.qloo.com"),
  ANTHROPIC_API_KEY: z.string().min(8).optional(),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  CC_DEMO_MODE: z.enum(["enabled", "disabled"]).default("disabled"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  VERCEL_ENV: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ConfigurationError(`Invalid server configuration for: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export class ConfigurationError extends Error {
  readonly kind = "configuration";
}

/** Demo fixtures are never available on a production deployment. */
export function demoModeAllowed(): boolean {
  const e = env();
  return e.CC_DEMO_MODE === "enabled" && e.VERCEL_ENV !== "production";
}

export function integrationStatus() {
  const e = env();
  return {
    database: Boolean(e.DATABASE_URL),
    auth:
      e.AUTH_MODE === "local"
        ? Boolean(e.SESSION_SECRET)
        : Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    authMode: e.AUTH_MODE,
    qloo: Boolean(e.QLOO_API_KEY),
    qlooHost: new URL(e.QLOO_API_URL).host,
    llm: Boolean(e.ANTHROPIC_API_KEY),
    llmModel: e.LLM_MODEL,
    webResearch: false,
    demoMode: demoModeAllowed(),
    storage: e.AUTH_MODE === "supabase" && Boolean(e.NEXT_PUBLIC_SUPABASE_URL),
  };
}

/** Last four characters only: used for safe diagnostics. */
export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
