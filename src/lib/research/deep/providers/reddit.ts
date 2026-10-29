import type { Hit, ProviderCall } from "../types";
import { decodeEntities, num, requestJson, str, UA, type Fetcher } from "./http";

/**
 * Reddit Data API via OAuth (application-only, client_credentials). Unauthenticated .json
 * scraping is deliberately not used: Reddit requires registered OAuth clients, and commercial
 * use needs Reddit's approval — so this provider is only enabled when credentials are set AND
 * REDDIT_COMMERCIAL_ACCESS=approved. Tokens last one hour and are cached in memory.
 */
let token: { value: string; exp: number } | null = null;

async function accessToken(clientId: string, secret: string, fetcher: Fetcher): Promise<string | null> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetcher("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!body?.access_token) return null;
  token = { value: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

export async function redditSearch(opts: { query: string; count?: number; timeframe?: "month" | "year" | "any"; clientId: string; clientSecret: string; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const fetcher = opts.fetcher ?? fetch;
  const params: Record<string, string> = { q: opts.query.slice(0, 200), limit: String(Math.min(opts.count ?? 8, 25)), sort: "relevance", t: opts.timeframe === "month" ? "month" : opts.timeframe === "year" ? "year" : "all", type: "link", raw_json: "1" };
  const tok = await accessToken(opts.clientId, opts.clientSecret, fetcher);
  if (!tok) {
    return { ok: false, data: [], status: "error", httpStatus: null, durationMs: 0, error: "Reddit OAuth token request failed", errorKind: "config", units: 0, costUsdEstimated: 0, costUsdActual: null, params, raw: null, cached: false };
  }
  return requestJson<Hit[]>({
    url: `https://oauth.reddit.com/search?${new URLSearchParams(params)}`,
    init: { headers: { Authorization: `bearer ${tok}`, "User-Agent": UA } },
    params, fallback: [], usdPerCall: 0, fetcher,
    parse: (b) => ((b as { data?: { children?: unknown[] } })?.data?.children ?? []).flatMap((c): Hit[] => {
      const d = (c as { data?: Record<string, unknown> }).data ?? {};
      const title = str(d.title), permalink = str(d.permalink);
      if (!title || !permalink || d.over_18 === true) return [];
      const created = num(d.created_utc);
      const metrics: Record<string, number> = {};
      const score = num(d.score), comments = num(d.num_comments);
      if (score !== null) metrics.score = score;
      if (comments !== null) metrics.comments = comments;
      return [{
        provider: "reddit", sourceType: "community_post", url: `https://www.reddit.com${permalink}`, externalId: str(d.name),
        title: decodeEntities(title), snippet: decodeEntities(str(d.selftext) ?? "").slice(0, 1500),
        publisher: str(d.subreddit_name_prefixed), publishedAt: created ? new Date(created * 1000).toISOString() : null,
        language: null, metrics, usageRestrictions: "Reddit Data API terms: honour user deletions; do not use to profile individual users.",
      }];
    }),
    empty: (d) => d.length === 0,
  });
}
