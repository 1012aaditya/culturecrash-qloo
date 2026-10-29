import type { Hit, ProviderCall } from "../types";
import { decodeEntities, isoOrNull, requestJson, str, type Fetcher } from "./http";

/**
 * Serper.dev — Real-time Google Search API.
 * Provides live Google Search organic results, news, peopleAlsoAsk, and related queries.
 */
export async function serperSearch(opts: {
  query: string;
  count?: number;
  country?: string | null;
  apiKey: string;
  usdPerCall?: number;
  fetcher?: Fetcher;
}): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 400);
  const num = Math.min(opts.count ?? 8, 15);
  const gl = opts.country && /^[a-z]{2}$/i.test(opts.country) ? opts.country.toLowerCase() : undefined;

  return requestJson<Hit[]>({
    url: "https://google.serper.dev/search",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": opts.apiKey,
      },
      body: JSON.stringify({
        q,
        num,
        ...(gl ? { gl } : {}),
      }),
    },
    params: { q, num: String(num), ...(gl ? { gl } : {}) },
    fallback: [],
    usdPerCall: opts.usdPerCall ?? 0.001,
    fetcher: opts.fetcher,
    parse: (body) => {
      const data = body as {
        organic?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
          date?: string;
          position?: number;
        }>;
      };

      const organic = data.organic ?? [];
      return organic.flatMap((item): Hit[] => {
        const title = str(item.title);
        const url = str(item.link);
        if (!title || !url) return [];

        const publisher = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return "Google";
          }
        })();

        return [{
          provider: "serper",
          sourceType: "web_page",
          url,
          externalId: null,
          title: decodeEntities(title),
          snippet: decodeEntities(str(item.snippet) ?? "").slice(0, 1500),
          publisher,
          publishedAt: isoOrNull(item.date),
          language: null,
          metrics: { position: item.position ?? 0 },
          usageRestrictions: null,
        }];
      });
    },
    empty: (d) => d.length === 0,
  });
}
