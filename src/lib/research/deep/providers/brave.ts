import type { Hit, ProviderCall } from "../types";
import { decodeEntities, isoOrNull, requestJson, str, type Fetcher } from "./http";

/**
 * Brave Search API — web search (primary web discovery).
 * Contract (Brave docs, to be re-verified on the first live call): GET
 * https://api.search.brave.com/res/v1/web/search with header X-Subscription-Token;
 * q, count (≤20), country, search_lang, freshness (pd|pw|pm|py), extra_snippets.
 * Results at web.results[] { title, url, description, page_age|age, profile.name, meta_url.hostname, extra_snippets[] }.
 */
export async function braveSearch(opts: { query: string; count?: number; country?: string | null; freshness?: "month" | "year" | "any"; apiKey: string; usdPerCall: number; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const params: Record<string, string> = { q: opts.query.slice(0, 400), count: String(Math.min(opts.count ?? 8, 20)), extra_snippets: "true", safesearch: "moderate" };
  if (opts.country && /^[a-z]{2}$/i.test(opts.country)) params.country = opts.country.toLowerCase();
  if (opts.freshness === "month") params.freshness = "pm";
  if (opts.freshness === "year") params.freshness = "py";
  return requestJson<Hit[]>({
    url: `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams(params)}`,
    init: { headers: { Accept: "application/json", "X-Subscription-Token": opts.apiKey } },
    params, fallback: [], usdPerCall: opts.usdPerCall, fetcher: opts.fetcher,
    parse: (b) => {
      const results = (b as { web?: { results?: unknown[] } })?.web?.results;
      if (!Array.isArray(results)) return [];
      return results.flatMap((r): Hit[] => {
        const o = r as Record<string, unknown>;
        const url = str(o.url);
        const title = str(o.title);
        if (!url || !title) return [];
        const extra = Array.isArray(o.extra_snippets) ? (o.extra_snippets as unknown[]).map((x) => str(x)).filter(Boolean) : [];
        const profile = o.profile as Record<string, unknown> | undefined;
        const meta = o.meta_url as Record<string, unknown> | undefined;
        return [{
          provider: "brave", sourceType: "web_page", url, externalId: null, title: decodeEntities(title),
          snippet: decodeEntities([str(o.description), ...extra].filter(Boolean).join(" … ")).slice(0, 1500),
          publisher: str(profile?.name) ?? str(meta?.hostname), publishedAt: isoOrNull(o.page_age),
          language: str(o.language), metrics: {}, usageRestrictions: null,
        }];
      });
    },
    empty: (d) => d.length === 0,
  });
}
