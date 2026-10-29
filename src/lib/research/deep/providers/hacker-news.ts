import type { Hit, ProviderCall } from "../types";
import { decodeEntities, num, requestJson, str, UA, type Fetcher } from "./http";

/**
 * Hacker News search adapter via Algolia Search API.
 * Free, fast, unauthenticated open API (fair use).
 * Provides raw developer, builder, AI, tech and founder sentiment.
 */
export async function hackerNewsSearch(opts: {
  query: string;
  count?: number;
  fetcher?: Fetcher;
}): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 200);
  const hitsPerPage = String(Math.min(opts.count ?? 5, 15));
  const params = { query: q, tags: "story", hitsPerPage };

  return requestJson<Hit[]>({
    url: `https://hn.algolia.com/api/v1/search?${new URLSearchParams(params)}`,
    init: { headers: { "User-Agent": UA, Accept: "application/json" } },
    params: { q, hitsPerPage },
    fallback: [],
    usdPerCall: 0,
    fetcher: opts.fetcher,
    parse: (body) => {
      const hits = (body as { hits?: unknown[] })?.hits;
      if (!Array.isArray(hits)) return [];

      return hits.flatMap((item): Hit[] => {
        const h = item as Record<string, unknown>;
        const title = str(h.title);
        const objectID = str(h.objectID);
        if (!title || !objectID) return [];

        const points = num(h.points) ?? 0;
        const numComments = num(h.num_comments) ?? 0;
        const author = str(h.author) ?? "community";
        const hnUrl = `https://news.ycombinator.com/item?id=${objectID}`;
        const externalUrl = str(h.url) ?? hnUrl;
        const createdAt = str(h.created_at);

        return [{
          provider: "hacker_news",
          sourceType: "community_post",
          url: externalUrl,
          externalId: objectID,
          title: decodeEntities(title),
          snippet: decodeEntities(`Discussion on Hacker News by ${author} (${points} points, ${numComments} comments). Thread: ${hnUrl}`),
          publisher: "Hacker News",
          publishedAt: createdAt,
          language: "en",
          metrics: {
            score: points,
            comments: numComments,
          },
          usageRestrictions: "Hacker News Algolia API terms: fair-use developer community discourse.",
        }];
      });
    },
    empty: (d) => d.length === 0,
  });
}
