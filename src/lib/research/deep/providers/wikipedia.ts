import type { Hit, ProviderCall } from "../types";
import { decodeEntities, requestJson, str, UA, type Fetcher } from "./http";

/**
 * Wikipedia (MediaWiki REST search). Free, no key; a descriptive User-Agent is required.
 * Content is CC BY-SA — attribution is kept with every excerpt. Used for background and
 * provenance (what a movement, brand or scene is), not for recency or audience claims.
 */
export async function wikipediaSearch(opts: { query: string; count?: number; lang?: string; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const lang = opts.lang && /^[a-z]{2}$/.test(opts.lang) ? opts.lang : "en";
  const params = { q: opts.query.slice(0, 200), limit: String(Math.min(opts.count ?? 3, 10)) };
  return requestJson<Hit[]>({
    url: `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?${new URLSearchParams(params)}`,
    init: { headers: { "User-Agent": UA, Accept: "application/json" } },
    params, fallback: [], usdPerCall: 0, fetcher: opts.fetcher,
    parse: (b) => ((b as { pages?: unknown[] })?.pages ?? []).flatMap((p): Hit[] => {
      const o = p as Record<string, unknown>;
      const key = str(o.key), title = str(o.title);
      if (!key || !title) return [];
      return [{
        provider: "wikipedia", sourceType: "encyclopedia", url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(key)}`, externalId: String(o.id ?? key),
        title, snippet: decodeEntities([str(o.description), str(o.excerpt)].filter(Boolean).join(" — ")).slice(0, 800),
        publisher: "Wikipedia", publishedAt: null, language: lang, metrics: {}, usageRestrictions: "CC BY-SA 4.0 — attribute Wikipedia contributors.",
      }];
    }),
    empty: (d) => d.length === 0,
  });
}
