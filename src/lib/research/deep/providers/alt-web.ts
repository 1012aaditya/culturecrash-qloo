import type { Hit, ProviderCall } from "../types";
import { hostOf } from "../url";
import { decodeEntities, isoOrNull, requestJson, str, type Fetcher } from "./http";

/** Tavily search — alternate web-search implementation behind the same interface. */
export async function tavilySearch(opts: { query: string; count?: number; apiKey: string; usdPerCall: number; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const params = { query: opts.query.slice(0, 400), max_results: String(Math.min(opts.count ?? 8, 10)), search_depth: "basic" };
  return requestJson<Hit[]>({
    url: "https://api.tavily.com/search",
    init: { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify({ query: params.query, max_results: Number(params.max_results), search_depth: "basic" }) },
    params, fallback: [], usdPerCall: opts.usdPerCall, fetcher: opts.fetcher,
    parse: (b) => ((b as { results?: unknown[] })?.results ?? []).flatMap((r): Hit[] => {
      const o = r as Record<string, unknown>;
      const url = str(o.url), title = str(o.title);
      if (!url || !title) return [];
      return [{ provider: "tavily", sourceType: "web_page", url, externalId: null, title: decodeEntities(title), snippet: decodeEntities(str(o.content) ?? "").slice(0, 1500), publisher: null, publishedAt: isoOrNull(o.published_date), language: null, metrics: {}, usageRestrictions: null }];
    }),
    empty: (d) => d.length === 0,
  });
}

/** Exa search — canonical implementation following Exa's build-with-exa specification. */
export async function exaSearch(opts: {
  query: string; count?: number; apiKey: string; usdPerCall: number; fetcher?: Fetcher;
  /** Only results published on or after this ISO time (Watch's incremental window). */
  startPublishedDate?: string;
  /** Only results published on or before this ISO time (Watch's history backfill). */
  endPublishedDate?: string;
  /** Restrict to one Exa category, e.g. "news". */
  category?: "news";
}): Promise<ProviderCall<Hit[]>> {
  const params: Record<string, string> = {
    query: opts.query.slice(0, 400), numResults: String(Math.min(opts.count ?? 8, 10)),
    ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}), ...(opts.endPublishedDate ? { endPublishedDate: opts.endPublishedDate } : {}),
    ...(opts.category ? { category: opts.category } : {}),
  };
  return requestJson<Hit[]>({
    url: "https://api.exa.ai/search",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey },
      body: JSON.stringify({
        query: params.query,
        type: "auto",
        numResults: Number(params.numResults),
        contents: { highlights: true },
        ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
        ...(opts.endPublishedDate ? { endPublishedDate: opts.endPublishedDate } : {}),
        ...(opts.category ? { category: opts.category } : {}),
      }),
    },
    params, fallback: [], usdPerCall: opts.usdPerCall, fetcher: opts.fetcher,
    parse: (b) => ((b as { results?: unknown[] })?.results ?? []).flatMap((r): Hit[] => {
      const o = r as Record<string, unknown>;
      const url = str(o.url), title = str(o.title);
      if (!url || !title) return [];
      const highlights = Array.isArray(o.highlights) ? (o.highlights as unknown[]).map((x) => str(x)).filter(Boolean) : [];
      const snippet = highlights.length > 0 ? highlights.join(" … ") : str(o.text) ?? "";
      return [{
        provider: "exa",
        sourceType: opts.category === "news" ? "news" : "web_page",
        url,
        externalId: str(o.id),
        title: decodeEntities(title),
        snippet: decodeEntities(snippet).slice(0, 1500),
        // Exa's "author" is a person (or empty), not the outlet; the site is the honest publisher.
        publisher: hostOf(url),
        publishedAt: isoOrNull(o.publishedDate),
        language: null,
        metrics: {},
        usageRestrictions: null,
      }];
    }),
    empty: (d) => d.length === 0,
  });
}
