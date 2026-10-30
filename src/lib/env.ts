import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once. Secrets never use the NEXT_PUBLIC_ prefix
 * and are only read here.
 */
/** Treat empty-string env vars the same as missing (undefined). */
function opt<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

const schema = z.object({
  DATABASE_URL: opt(z.string().url()),
  AUTH_MODE: z.enum(["supabase", "local"]).default("supabase"),
  NEXT_PUBLIC_SUPABASE_URL: opt(z.string().url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: opt(z.string().min(10)),
  SUPABASE_STORAGE_BUCKET: z.string().default("brief-documents"),
  SESSION_SECRET: opt(z.string().min(32)),
  QLOO_API_KEY: opt(z.string().min(8)),
  QLOO_API_URL: z.string().url().default("https://hackathon.api.qloo.com"),
  // signal.demographics.age is only sent when enabled: its accepted values are not yet verified
  // against Qloo's docs, and an invalid value could fail every insights call.
  QLOO_AGE_SIGNAL: opt(z.enum(["enabled"])),
  ANTHROPIC_API_KEY: opt(z.string().min(8)),
  TAVILY_API_KEY: opt(z.string().min(8)),
  BRAVE_API_KEY: opt(z.string().min(8)),
  SERPER_API_KEY: opt(z.string().min(8)),
  // Google autocomplete is undocumented: off unless explicitly enabled.
  GOOGLE_SUGGEST: opt(z.enum(["enabled"])),
  EXA_API_KEY: opt(z.string().min(8)),
  FIRECRAWL_API_KEY: opt(z.string().min(8)),
  YOUTUBE_API_KEY: opt(z.string().min(8)),
  // YouTube's free quota is 10,000 units a day per key (a search costs 100). Watch stops searching
  // YouTube once this many units have been used today, leaving room for research.
  YOUTUBE_DAILY_UNIT_CAP: z.coerce.number().int().min(0).default(8000),
  REDDIT_CLIENT_ID: opt(z.string().min(8)),
  REDDIT_CLIENT_SECRET: opt(z.string().min(8)),
  // Reddit requires approval for commercial use of its Data API; set to "approved" only once granted.
  REDDIT_COMMERCIAL_ACCESS: opt(z.enum(["approved"])),
  // Estimated prices per request (USD) — providers rarely return actual charges. Check your plan.
  BRAVE_USD_PER_REQUEST: z.coerce.number().min(0).default(0.005),
  SERPER_USD_PER_REQUEST: z.coerce.number().min(0).default(0.001),
  TAVILY_USD_PER_REQUEST: z.coerce.number().min(0).default(0.008),
  EXA_USD_PER_REQUEST: z.coerce.number().min(0).default(0.007), // measured: Exa news search with highlights, Oct 2026
  // Ceiling on estimated research spend across ALL workspaces this calendar month (USD). Every workspace
  // shares the server's provider keys, so this stops many signups from adding up to an unbounded bill.
  // Unset = no platform ceiling (only per-workspace budgets apply).
  PLATFORM_SPEND_CAP_USD: opt(z.coerce.number().min(0)),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  // Smaller model for planning and claim extraction; the main model writes the synthesis.
  LLM_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  CC_DEMO_MODE: z.enum(["enabled", "disabled"]).default("disabled"),
  RESEND_API_KEY: opt(z.string().min(8)),
  EMAIL_FROM: opt(z.string().min(3)),
  PILOT_NOTIFY_EMAIL: opt(z.string().email()),
  CRON_SECRET: opt(z.string().min(16)),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  VERCEL_ENV: opt(z.string()),
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
    webResearch: true,
    tavily: Boolean(e.TAVILY_API_KEY),
    brave: Boolean(e.BRAVE_API_KEY),
    serper: Boolean(e.SERPER_API_KEY),
    exa: Boolean(e.EXA_API_KEY),
    firecrawl: Boolean(e.FIRECRAWL_API_KEY),
    youtube: Boolean(e.YOUTUBE_API_KEY),
    email: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM),
    demoMode: demoModeAllowed(),
    storage: e.AUTH_MODE === "supabase" && Boolean(e.NEXT_PUBLIC_SUPABASE_URL),
  };
}

/** Last four characters only: used for safe diagnostics. */
export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
