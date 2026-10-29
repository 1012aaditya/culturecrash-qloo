import type { Hit, ProviderCall } from "../types";
import { decodeEntities, isoOrNull, num, requestJson, str, type Fetcher } from "./http";

/**
 * YouTube Data API v3. search.list (100 quota units) finds videos; one videos.list call
 * (1 unit) adds public statistics for all of them. Transcripts of third-party videos are NOT
 * fetched: captions.download requires the video owner's authorisation. API data is subject to
 * YouTube's storage rules, so excerpts are expired by the retention job.
 */
export async function youtubeSearch(opts: { query: string; count?: number; regionCode?: string | null; publishedAfter?: string | null; apiKey: string; fetcher?: Fetcher }): Promise<ProviderCall<Hit[]>> {
  const params: Record<string, string> = { part: "snippet", type: "video", q: opts.query.slice(0, 200), maxResults: String(Math.min(opts.count ?? 5, 15)), order: "relevance" };
  if (opts.regionCode && /^[a-z]{2}$/i.test(opts.regionCode)) params.regionCode = opts.regionCode.toUpperCase();
  if (opts.publishedAfter) params.publishedAfter = opts.publishedAfter;
  const search = await requestJson<Hit[]>({
    url: `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ ...params, key: opts.apiKey })}`,
    params, fallback: [], units: 100, usdPerCall: 0, fetcher: opts.fetcher,
    parse: (b) => ((b as { items?: unknown[] })?.items ?? []).flatMap((it): Hit[] => {
      const o = it as { id?: { videoId?: unknown }; snippet?: Record<string, unknown> };
      const id = str(o.id?.videoId);
      const sn = o.snippet ?? {};
      const title = str(sn.title);
      if (!id || !title) return [];
      return [{
        provider: "youtube", sourceType: "video", url: `https://www.youtube.com/watch?v=${id}`, externalId: id, title: decodeEntities(title),
        snippet: decodeEntities(str(sn.description) ?? "").slice(0, 800), publisher: str(sn.channelTitle), publishedAt: isoOrNull(sn.publishedAt),
        language: str(sn.defaultAudioLanguage) ?? str(sn.defaultLanguage), metrics: {},
        usageRestrictions: "YouTube API Services data: refresh or delete within 30 days; no transcript retrieved.",
      }];
    }),
    empty: (d) => d.length === 0,
  });
  if (!search.ok || !search.data.length) return search;
  // Public statistics (views, likes, comments) — only the fields YouTube returns.
  const ids = search.data.map((h) => h.externalId!).join(",");
  const stats = await requestJson<Record<string, Record<string, number>>>({
    url: `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "statistics", id: ids, key: opts.apiKey })}`,
    params: { part: "statistics", id: ids }, fallback: {}, units: 1, usdPerCall: 0, fetcher: opts.fetcher, attempts: 2,
    parse: (b) => Object.fromEntries(((b as { items?: unknown[] })?.items ?? []).map((it) => {
      const o = it as { id?: unknown; statistics?: Record<string, unknown> };
      const m: Record<string, number> = {};
      for (const [k, key] of [["viewCount", "views"], ["likeCount", "likes"], ["commentCount", "comments"]] as const) {
        const v = num(o.statistics?.[k]);
        if (v !== null) m[key] = v;
      }
      return [String(o.id), m];
    })),
    empty: () => false,
  });
  return { ...search, units: search.units + stats.units, durationMs: search.durationMs + stats.durationMs, data: search.data.map((h) => ({ ...h, metrics: stats.data[h.externalId!] ?? {} })) };
}
