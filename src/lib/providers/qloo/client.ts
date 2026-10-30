import { extractList, normalizeEntity, normalizeTag } from "./normalize";
import { QlooError, type EntityTypeUrn, type NormalizedEntity, type NormalizedTag, type QlooCall } from "./types";

const ALLOWED_HOSTS = new Set(["hackathon.api.qloo.com", "api.qloo.com", "staging.api.qloo.com"]);
const TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const MAX_TIMEOUT_ATTEMPTS = 2;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type InsightsParams = {
  filterType: EntityTypeUrn | "urn:tag" | "urn:demographics";
  signalEntities?: string[];
  /** Tag ids from /v2/tags → signal.interests.tags. */
  signalTags?: string[];
  signalLocationQuery?: string;
  /** Restrict urn:tag insights to these tag types (e.g. urn:tag:lifestyle:qloo). */
  filterTagTypes?: string[];
  signalDemographicsAge?: string;
  filterLocationQuery?: string;
  take?: number;
  explainability?: boolean;
  excludeEntities?: string[];
};

export class QlooClient {
  private readonly origin: string;

  constructor(
    private readonly apiKey: string | undefined,
    baseUrl: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
      throw new QlooError(`Unsupported Qloo API origin: ${url.host}`, "invalid_response");
    }
    this.origin = url.origin;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  /** GET with timeout and bounded retries for 429 / 5xx / network failures. */
  private async get(path: string, params: Record<string, string>): Promise<{ status: number; body: unknown; durationMs: number }> {
    if (!this.apiKey) throw new QlooError("QLOO_API_KEY is not configured", "missing_key");
    const url = new URL(path, this.origin);
    for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
    let lastError: QlooError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const res = await this.fetcher(url.toString(), {
          headers: { "X-Api-Key": this.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "error",
          cache: "no-store",
        });
        const durationMs = Date.now() - started;
        if (res.status === 429 || res.status >= 500) {
          lastError = new QlooError(res.status === 429 ? "Qloo rate limit reached" : `Qloo returned HTTP ${res.status}`, res.status === 429 ? "rate_limited" : "http", res.status);
          if (attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(res.headers.get("retry-after"));
            await this.sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt, 8000));
            continue;
          }
          throw lastError;
        }
        let body: unknown = null;
        const text = await res.text();
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          throw new QlooError("Qloo returned a non-JSON response", "invalid_response", res.status);
        }
        // Search answers 404 for "no results"; treat it as empty.
        if (res.status === 404 && path === "/search") return { status: 404, body: { results: [] }, durationMs };
        if (res.status === 401) {
          throw new QlooError("Qloo rejected the API key (401). Hackathon keys only work against https://hackathon.api.qloo.com — check QLOO_API_URL and QLOO_API_KEY.", "unauthorized", 401);
        }
        if (res.status === 403) {
          throw new QlooError(`Qloo denied this request (403)${safeMessage(body) ? `: ${safeMessage(body)}` : ""}. The entity type is likely not enabled for this key.`, "forbidden_type", 403);
        }
        if (!res.ok) {
          const msg = safeMessage(body);
          throw new QlooError(`Qloo returned HTTP ${res.status}${msg ? `: ${msg}` : ""}`, "http", res.status);
        }
        return { status: res.status, body, durationMs };
      } catch (e) {
        if (e instanceof QlooError) {
          if (e.code === "rate_limited" || (e.code === "http" && (e.httpStatus ?? 0) >= 500)) {
            lastError = e;
            if (attempt < MAX_ATTEMPTS) continue;
          }
          throw e;
        }
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = new QlooError(timeout ? "Qloo request timed out" : "Could not reach the Qloo API", timeout ? "timeout" : "network");
        // A query that timed out twice keeps timing out (live: place insights for India), and each try
        // costs TIMEOUT_MS of the research run's time budget, so timeouts get one retry only.
        if (attempt < (timeout ? MAX_TIMEOUT_ATTEMPTS : MAX_ATTEMPTS)) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        break;
      }
    }
    throw lastError ?? new QlooError("Qloo request failed", "network");
  }

  private async call<T>(path: string, params: Record<string, string>, parse: (body: unknown) => T, isEmpty: (t: T) => boolean): Promise<QlooCall<T>> {
    const retrievedAt = new Date().toISOString();
    const res = await this.get(path, params);
    const data = parse(res.body);
    return { endpoint: path, params, status: isEmpty(data) ? "empty" : "ok", httpStatus: res.status, durationMs: res.durationMs, raw: res.body, data, error: null, retrievedAt };
  }

  /** Resolve free text to provider entities. */
  search(query: string, types: EntityTypeUrn[] = [], take = 5) {
    const params: Record<string, string> = { query: query.slice(0, 200), take: String(Math.max(1, Math.min(take, 20))) };
    if (types.length) params.types = types.join(",");
    return this.call<NormalizedEntity[]>("/search", params, (b) => parseEntities(b), (d) => d.length === 0);
  }

  /** /v2/insights for entity recommendations by affinity. */
  insights(p: InsightsParams) {
    const params = insightParams(p);
    return this.call<NormalizedEntity[]>("/v2/insights", params, (b) => parseEntities(b), (d) => d.length === 0);
  }

  /** /v2/tags — resolve free text (e.g. an audience interest) to Qloo tag ids. */
  searchTags(query: string, take = 3) {
    const params = { "filter.query": query.slice(0, 120), take: String(Math.max(1, Math.min(take, 20))) };
    return this.call<NormalizedTag[]>("/v2/tags", params, (b) => {
      const list = extractList(b, "tags");
      if (list === null) throw new QlooError("Unexpected Qloo tags response shape", "invalid_response");
      return list.map(normalizeTag).filter((t): t is NormalizedTag => Boolean(t));
    }, (d) => d.length === 0);
  }

  /** /v2/insights with filter.type=urn:tag — taste tags associated with the signal. */
  tagInsights(p: Omit<InsightsParams, "filterType">) {
    const params = insightParams({ ...p, filterType: "urn:tag" });
    return this.call<NormalizedTag[]>("/v2/insights", params, (b) => {
      const list = extractList(b, "tags");
      if (list === null) throw new QlooError("Unexpected Qloo tags response shape", "invalid_response");
      return list.map(normalizeTag).filter((t): t is NormalizedTag => Boolean(t));
    }, (d) => d.length === 0);
  }
}

function insightParams(p: InsightsParams): Record<string, string> {
  const params: Record<string, string> = { "filter.type": p.filterType, take: String(Math.max(1, Math.min(p.take ?? 8, 50))) };
  if (p.signalEntities?.length) params["signal.interests.entities"] = p.signalEntities.join(",");
  if (p.signalTags?.length) params["signal.interests.tags"] = p.signalTags.join(",");
  if (p.signalLocationQuery) params["signal.location.query"] = p.signalLocationQuery;
  if (p.filterLocationQuery) params["filter.location.query"] = p.filterLocationQuery;
  if (p.signalDemographicsAge) params["signal.demographics.age"] = p.signalDemographicsAge;
  if (p.excludeEntities?.length) params["filter.exclude.entities"] = p.excludeEntities.join(",");
  if (p.explainability) params["feature.explainability"] = "true";
  if (p.filterTagTypes?.length) params["filter.tag.types"] = p.filterTagTypes.join(",");
  return params;
}

function parseEntities(body: unknown): NormalizedEntity[] {
  const list = extractList(body, "entities");
  if (list === null) throw new QlooError("Unexpected Qloo response shape (no results field)", "invalid_response");
  return list.map(normalizeEntity).filter((e): e is NormalizedEntity => Boolean(e));
}

function safeMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  // Documented shape: {"errors":[{"message":"…","path":"signal.interests.entities"}]}
  if (Array.isArray(o.errors)) {
    const msgs = o.errors
      .map((e) => (e && typeof e === "object" ? [String((e as Record<string, unknown>).message ?? ""), (e as Record<string, unknown>).path ? `(${String((e as Record<string, unknown>).path)})` : ""].join(" ").trim() : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ").replace(/\s+/g, " ").slice(0, 240);
  }
  for (const k of ["error", "message", "detail"]) {
    const v = o[k];
    if (typeof v === "string") return v.replace(/\s+/g, " ").slice(0, 160);
    if (v && typeof v === "object" && typeof (v as Record<string, unknown>).message === "string") return String((v as Record<string, unknown>).message).slice(0, 160);
  }
  return null;
}
