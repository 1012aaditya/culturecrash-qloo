import type { Hit, ProviderCall } from "../types";
import { requestJson, str, UA, type Fetcher } from "./http";

/**
 * Google search suggestions (autocomplete). This is NOT Google Trends: it returns the phrasings
 * Google suggests for a query at retrieval time — useful for audience language — and no search
 * volume, no time series and no interest index. The endpoint is undocumented, so the provider is
 * off unless GOOGLE_SUGGEST=enabled, and nothing from it is stored as a trend observation.
 */
export async function googleSuggest(opts: { query: string; country?: string | null; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 200);
  const gl = opts.country && /^[a-z]{2}$/i.test(opts.country) ? opts.country.toUpperCase() : null;
  const params: Record<string, string> = { client: "firefox", q, hl: "en", ...(gl ? { gl } : {}) };
  return requestJson<Hit[]>({
    url: `https://suggestqueries.google.com/complete/search?${new URLSearchParams(params)}`,
    init: { headers: { "User-Agent": UA, Accept: "application/json" } },
    params, fallback: [], usdPerCall: 0, fetcher: opts.fetcher, attempts: 2,
    parse: (body) => {
      if (!Array.isArray(body) || !Array.isArray(body[1])) throw new Error("expected [query, suggestions]");
      const suggestions = (body[1] as unknown[]).map((s) => str(s)).filter((s): s is string => Boolean(s) && s!.toLowerCase() !== q.toLowerCase()).slice(0, 10);
      if (!suggestions.length) return [];
      // One document per query: the list of suggested phrasings, in Google's order (no scores).
      return [{
        provider: "google_suggest", sourceType: "search_suggestions", url: null, externalId: `suggest:${gl ?? "any"}:${q.toLowerCase()}`,
        title: `Google search suggestions for “${q}”${gl ? ` (${gl})` : ""}`,
        snippet: `When people type “${q}”, Google suggests: ${suggestions.map((s) => `“${s}”`).join(", ")}.`,
        publisher: "Google autocomplete", publishedAt: null, language: "en", metrics: {},
        usageRestrictions: "Undocumented autocomplete endpoint. Shows phrasing only — not search volume, interest or trend data.",
      }];
    },
    empty: (d) => d.length === 0,
  });
}
