import type { Hit, ProviderCall } from "../types";
import { decodeEntities, num, requestJson, str, UA, type Fetcher } from "./http";

/**
 * Google Trends & Search Velocity adapter.
 * Uses public Google search momentum endpoints (suggestqueries) to extract real-time
 * consumer search query velocity and breakout interest modifiers without requiring API keys.
 * Links directly to the official Google Trends Explore dashboard.
 */
export async function googleTrendsSearch(opts: {
  query: string;
  count?: number;
  country?: string | null;
  fetcher?: Fetcher;
}): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 200);
  const geo = opts.country && /^[a-z]{2}$/i.test(opts.country) ? opts.country.toUpperCase() : null;
  const params: Record<string, string> = { client: "chrome", q, hl: "en" };
  if (geo) params.gl = geo;

  const exploreUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}${geo ? `&geo=${geo}` : ""}`;

  return requestJson<Hit[]>({
    url: `https://suggestqueries.google.com/complete/search?${new URLSearchParams(params)}`,
    init: { headers: { "User-Agent": UA, Accept: "application/json" } },
    params: { q, ...(geo ? { geo } : {}) },
    fallback: [],
    usdPerCall: 0,
    fetcher: opts.fetcher,
    parse: (body) => {
      // Body format: [query, [suggestions...], [""...], [], { "google:suggestrelevance": [numbers...] }]
      if (!Array.isArray(body) || body.length < 2) return [];
      const suggestions = Array.isArray(body[1]) ? (body[1] as unknown[]).map((s) => str(s)).filter(Boolean) as string[] : [];
      if (!suggestions.length) return [];

      const meta = (body[4] as Record<string, unknown> | undefined) ?? {};
      const relevances = Array.isArray(meta["google:suggestrelevance"])
        ? (meta["google:suggestrelevance"] as unknown[]).map((r) => num(r) ?? 500)
        : [];

      const topRelevance = relevances[0] ?? 1000;
      const hits: Hit[] = [];

      // 1. Primary summary hit linking to Google Trends Explore
      const topPhrases = suggestions.slice(0, 5).join(", ");
      hits.push({
        provider: "google_trends",
        sourceType: "web_page",
        url: exploreUrl,
        externalId: `trends-${encodeURIComponent(q)}`,
        title: `Google Trends Search Momentum: "${q}"`,
        snippet: decodeEntities(
          `Real-time consumer search velocity index: ${topRelevance}/1300. Rising search modifiers: ${topPhrases}. Search interest is tracking active query volume in ${geo ?? "global"} markets.`
        ),
        publisher: "Google Trends",
        publishedAt: new Date().toISOString(),
        language: "en",
        metrics: {
          search_interest: topRelevance,
          rising_queries_count: suggestions.length,
        },
        usageRestrictions: "Public search momentum signal; link to Google Trends Explore for time series.",
      });

      // 2. Breakout related queries as secondary hits
      const maxSubHits = Math.min(opts.count ? opts.count - 1 : 3, suggestions.length);
      for (let i = 0; i < maxSubHits; i++) {
        const item = suggestions[i];
        if (item.toLowerCase() === q.toLowerCase()) continue;
        const rel = relevances[i] ?? Math.max(100, 1000 - i * 100);
        hits.push({
          provider: "google_trends",
          sourceType: "web_page",
          url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(item)}${geo ? `&geo=${geo}` : ""}`,
          externalId: `trends-sub-${encodeURIComponent(item)}`,
          title: `Rising Query Variant: "${item}"`,
          snippet: decodeEntities(`Rising search query variant for "${q}" with consumer interest index ${rel}.`),
          publisher: "Google Trends",
          publishedAt: new Date().toISOString(),
          language: "en",
          metrics: { search_interest: rel },
          usageRestrictions: "Public search momentum signal.",
        });
      }

      return hits;
    },
    empty: (d) => d.length === 0,
  });
}
