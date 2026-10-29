import { describe, expect, it, vi } from "vitest";
import { exaSearch, tavilySearch } from "@/lib/research/deep/providers/alt-web";
import { braveSearch } from "@/lib/research/deep/providers/brave";
import { classify, requestJson } from "@/lib/research/deep/providers/http";
import { googleSuggest } from "@/lib/research/deep/providers/google-suggest";
import { hackerNewsSearch } from "@/lib/research/deep/providers/hacker-news";
import { redditSearch } from "@/lib/research/deep/providers/reddit";
import { wikipediaSearch } from "@/lib/research/deep/providers/wikipedia";
import { youtubeSearch } from "@/lib/research/deep/providers/youtube";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const noSleep = async () => {};

describe("provider HTTP helper", () => {
  it("classifies errors: auth = config, 429/5xx = retryable, other 4xx = permanent", () => {
    expect(classify(401)).toBe("config");
    expect(classify(429)).toBe("retryable");
    expect(classify(503)).toBe("retryable");
    expect(classify(400)).toBe("permanent");
    expect(classify(null)).toBe("retryable");
  });
  it("retries retryable failures with bounded attempts and never throws", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 429, { "retry-after": "1" })).mockResolvedValueOnce(json({ ok: 1 }));
    const r = await requestJson({ url: "https://x.test", params: {}, parse: (b) => b, empty: () => false, fallback: null, fetcher, sleep: noSleep });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(true);
    const bad = await requestJson({ url: "https://x.test", params: {}, parse: (b) => b, empty: () => false, fallback: null, fetcher: vi.fn(async () => json({}, 401)), sleep: noSleep });
    expect(bad).toMatchObject({ ok: false, status: "error", httpStatus: 401, errorKind: "config" });
  });
});

describe("Brave adapter", () => {
  it("sends the key only in the header and normalises results without inventing fields", async () => {
    const fetcher = vi.fn(async () => json({ web: { results: [
      { title: "Gen Z &amp; skincare", url: "https://news.test/a", description: "<strong>Short</strong> routines", page_age: "2026-09-01T00:00:00Z", profile: { name: "News Test" }, extra_snippets: ["more context"] },
      { title: "no url" },
    ] } }));
    const r = await braveSearch({ query: "gen z skincare", country: "IN", freshness: "year", apiKey: "secret-key", usdPerCall: 0.005, fetcher });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.searchParams.get("country")).toBe("in");
    expect(u.searchParams.get("freshness")).toBe("py");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["X-Subscription-Token"]).toBe("secret-key");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ title: "Gen Z & skincare", snippet: "Short routines … more context", publisher: "News Test", publishedAt: "2026-09-01T00:00:00.000Z" });
    expect(r.costUsdEstimated).toBe(0.005);
  });
});

describe("YouTube adapter", () => {
  it("adds public statistics from one videos.list call and records quota units", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ items: [{ id: { videoId: "v1" }, snippet: { title: "Routine", description: "d", channelTitle: "Creator", publishedAt: "2026-08-01T00:00:00Z" } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: "v1", statistics: { viewCount: "1200", likeCount: "80" } }] }));
    const r = await youtubeSearch({ query: "skincare", apiKey: "k-12345678", fetcher });
    expect(r.units).toBe(101);
    expect(r.data[0]).toMatchObject({ url: "https://www.youtube.com/watch?v=v1", publisher: "Creator", metrics: { views: 1200, likes: 80 } });
    expect(r.data[0].usageRestrictions).toMatch(/30 days/);
    expect(JSON.stringify(r.params)).not.toContain("k-12345678");
  });
});

describe("Reddit adapter", () => {
  it("uses OAuth client credentials, then oauth.reddit.com; skips NSFW posts", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ data: { children: [
        { data: { title: "Routine fatigue", permalink: "/r/x/comments/1/a", subreddit_name_prefixed: "r/x", selftext: "too many steps", score: 40, num_comments: 12, created_utc: 1767225600, name: "t3_1" } },
        { data: { title: "nsfw", permalink: "/r/y/2", over_18: true } },
      ] } }));
    const r = await redditSearch({ query: "skincare routine", clientId: "client-123", clientSecret: "secret-123", fetcher });
    expect(String(fetcher.mock.calls[0][0])).toBe("https://www.reddit.com/api/v1/access_token");
    expect(String(fetcher.mock.calls[1][0])).toMatch(/^https:\/\/oauth\.reddit\.com\/search\?/);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ sourceType: "community_post", publisher: "r/x", metrics: { score: 40, comments: 12 } });
  });
});

describe("Google search suggestions (not Google Trends)", () => {
  it("reports phrasing only: no invented index, no fake publication date, no trend metric", async () => {
    const fetcher = vi.fn(async () => json(["cottagecore", ["cottagecore aesthetic", "cottagecore dress", "cottagecore"], [], { "google:suggestrelevance": [1250, 1100, 950] }]));
    const r = await googleSuggest({ query: "cottagecore", country: "US", fetcher });
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ provider: "google_suggest", sourceType: "search_suggestions", publishedAt: null, metrics: {}, url: null });
    expect(r.data[0].snippet).toContain("“cottagecore aesthetic”");
    expect(r.data[0].snippet).not.toMatch(/1250|velocity|index/i);
    expect(r.data[0].usageRestrictions).toMatch(/not search volume/);
    // An unexpected shape is a validation failure, not an empty success.
    const bad = await googleSuggest({ query: "x", fetcher: vi.fn(async () => json({ nope: true })) });
    expect(bad).toMatchObject({ ok: false, errorKind: "permanent" });
  });
});

describe("Hacker News adapter", () => {
  it("extracts builder and tech community posts via open Algolia search API", async () => {
    const fetcher = vi.fn(async () => json({
      hits: [
        {
          title: "Show HN: Open Source Local LLM",
          objectID: "12345",
          url: "https://example.com/llm",
          author: "builder",
          points: 340,
          num_comments: 88,
          created_at: "2026-02-15T12:00:00Z"
        }
      ]
    }));
    const r = await hackerNewsSearch({ query: "local llm", fetcher });
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      provider: "hacker_news",
      sourceType: "community_post",
      title: "Show HN: Open Source Local LLM",
      metrics: { score: 340, comments: 88 },
      publisher: "Hacker News",
    });
  });
});

describe("Wikipedia, Tavily and Exa adapters", () => {
  it("normalise their documented shapes", async () => {
    const w = await wikipediaSearch({ query: "K-pop", fetcher: vi.fn(async () => json({ pages: [{ id: 1, key: "K-pop", title: "K-pop", excerpt: "<span>South Korean</span> popular music", description: "Genre" }] })) });
    expect(w.data[0]).toMatchObject({ url: "https://en.wikipedia.org/wiki/K-pop", sourceType: "encyclopedia", snippet: "Genre — South Korean popular music" });
    const t = await tavilySearch({ query: "q", apiKey: "k-12345678", usdPerCall: 0.008, fetcher: vi.fn(async () => json({ results: [{ title: "T", url: "https://t.test", content: "c", published_date: "2026-01-02" }] })) });
    expect(t.data[0]).toMatchObject({ provider: "tavily", publishedAt: "2026-01-02T00:00:00.000Z" });
    const e = await exaSearch({ query: "q", apiKey: "k-12345678", usdPerCall: 0.005, fetcher: vi.fn(async () => json({ results: [{ id: "e1", title: "E", url: "https://e.test", highlights: ["cultural highlight snippet"] }] })) });
    expect(e.data[0]).toMatchObject({ provider: "exa", externalId: "e1", snippet: "cultural highlight snippet", publishedAt: null });
  });
});
