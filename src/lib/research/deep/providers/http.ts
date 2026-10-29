import type { ProviderCall } from "../types";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export const UA = "CultureCrashResearchBot/1.0 (+https://culturecrash.app/bot; research for brand strategy)";

export function classify(status: number | null): ProviderCall<unknown>["errorKind"] {
  if (status === null) return "retryable";
  if (status === 401 || status === 403) return "config";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retryable";
  return "permanent";
}

/**
 * GET/POST JSON with a timeout and bounded retries (exponential backoff with full jitter,
 * honouring Retry-After up to 8 s). Never throws: failures come back as a ProviderCall.
 */
export async function requestJson<T>(opts: {
  url: string;
  init?: RequestInit;
  params: Record<string, string>;
  parse: (body: unknown) => T;
  empty: (t: T) => boolean;
  fallback: T;
  units?: number;
  usdPerCall?: number;
  timeoutMs?: number;
  attempts?: number;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ProviderCall<T>> {
  const fetcher = opts.fetcher ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const attempts = opts.attempts ?? 3;
  const started = Date.now();
  let lastStatus: number | null = null;
  let lastError = "Request failed";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetcher(opts.url, { ...opts.init, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
      lastStatus = res.status;
      if (res.ok) {
        const body = (await res.json()) as unknown;
        let data: T;
        try {
          data = opts.parse(body);
        } catch (e) {
          return fail(opts, started, res.status, `Unexpected response shape: ${e instanceof Error ? e.message : "parse error"}`, "permanent", body);
        }
        return {
          ok: true, data, status: opts.empty(data) ? "empty" : "ok", httpStatus: res.status, durationMs: Date.now() - started,
          error: null, errorKind: null, units: opts.units ?? 1, costUsdEstimated: opts.usdPerCall ?? 0, costUsdActual: null,
          params: opts.params, raw: body, cached: false,
        };
      }
      await res.body?.cancel();
      lastError = `HTTP ${res.status}`;
      const kind = classify(res.status);
      if (kind !== "retryable" || i === attempts - 1) return fail(opts, started, res.status, lastError, kind, null);
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 8000) : Math.random() * 400 * 2 ** i);
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError" ? "Timed out" : "Network error";
      if (i === attempts - 1) break;
      await sleep(Math.random() * 400 * 2 ** i);
    }
  }
  return fail(opts, started, lastStatus, lastError, "retryable", null);
}

function fail<T>(opts: { params: Record<string, string>; fallback: T; units?: number; usdPerCall?: number }, started: number, status: number | null, error: string, kind: ProviderCall<T>["errorKind"], raw: unknown): ProviderCall<T> {
  // Failed calls that reached the provider may still be billed; count the estimate only for HTTP responses.
  return {
    ok: false, data: opts.fallback, status: "error", httpStatus: status, durationMs: Date.now() - started, error, errorKind: kind,
    units: status ? opts.units ?? 1 : 0, costUsdEstimated: status && status < 500 && status !== 429 ? opts.usdPerCall ?? 0 : 0, costUsdActual: null,
    params: opts.params, raw, cached: false,
  };
}

export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
export function isoOrNull(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function decodeEntities(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
