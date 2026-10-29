import type { Hit, ProviderCall } from "../types";
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

/** Exa search — alternate web-search implementation (stronger on long-tail essays and blogs). */
export async function exaSearch(opts: { query: string; count?: number; apiKey: string; usdPerCall: number; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const params = { query: opts.query.slice(0, 400), numResults: String(Math.min(opts.count ?? 8, 10)) };
  return requestJson<Hit[]>({
    url: "https://api.exa.ai/search",
    init: { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey }, body: JSON.stringify({ query: params.query, numResults: Number(params.numResults), contents: { text: { maxCharacters: 1200 } } }) },
    params, fallback: [], usdPerCall: opts.usdPerCall, fetcher: opts.fetcher,
    parse: (b) => ((b as { results?: unknown[] })?.results ?? []).flatMap((r): Hit[] => {
      const o = r as Record<string, unknown>;
      const url = str(o.url), title = str(o.title);
      if (!url || !title) return [];
      return [{ provider: "exa", sourceType: "web_page", url, externalId: str(o.id), title: decodeEntities(title), snippet: decodeEntities(str(o.text) ?? "").slice(0, 1500), publisher: str(o.author), publishedAt: isoOrNull(o.publishedDate), language: null, metrics: {}, usageRestrictions: null }];
    }),
    empty: (d) => d.length === 0,
  });
}
