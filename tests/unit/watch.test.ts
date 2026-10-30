import { describe, expect, it, vi } from "vitest";
import { exaSearch } from "@/lib/research/deep/providers/alt-web";
import { parseNewsDate, serperNews } from "@/lib/research/deep/providers/serper";
import { buildWatchPlan, clipExcerpt, EXCERPT_MAX, matchTarget, mentions, nextCheckAt, nextRunAfter, type WatchTarget } from "@/lib/watch/plan";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOW = Date.parse("2026-10-30T12:00:00Z");
const nike: WatchTarget = { id: "n", role: "company", name: "Nike", aliases: [] };
const adidas: WatchTarget = { id: "a", role: "competitor", name: "Adidas", aliases: [] };
const puma: WatchTarget = { id: "p", role: "competitor", name: "Puma", aliases: [] };

describe("Serper news dates", () => {
  it("turns relative dates into approximate times and calendar dates into day precision", () => {
    expect(parseNewsDate("5 hours ago", NOW)).toEqual({ at: "2026-10-30T07:00:00.000Z", precision: "approximate" });
    expect(parseNewsDate("1 day ago", NOW)).toEqual({ at: "2026-10-29T12:00:00.000Z", precision: "approximate" });
    expect(parseNewsDate("2 weeks ago", NOW)?.precision).toBe("approximate");
    expect(parseNewsDate("yesterday", NOW)?.precision).toBe("approximate");
    expect(parseNewsDate("Oct 28, 2026", NOW)?.precision).toBe("day");
  });
  it("never guesses a date it can't read", () => {
    expect(parseNewsDate(null, NOW)).toBeNull();
    expect(parseNewsDate("", NOW)).toBeNull();
    expect(parseNewsDate("recently", NOW)).toBeNull();
    expect(parseNewsDate("Oct 28", NOW)).toBeNull(); // no year: ambiguous
  });
});

describe("Serper news adapter", () => {
  it("asks for a recency window and keeps the source's date precision", async () => {
    const fetcher = vi.fn(async () => json({ news: [
      { title: "Nike launches a new runner", link: "https://news.test/nike-runner", snippet: "Nike said…", source: "News Test", date: "3 hours ago" },
      { title: "Undated", link: "https://news.test/undated", snippet: "x", source: "Wire" },
      { title: "no link" },
    ] }));
    const r = await serperNews({ query: '"Nike"', window: "d", country: "GB", apiKey: "secret-key", fetcher, now: NOW });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://google.serper.dev/news");
    expect(JSON.parse(init.body as string)).toMatchObject({ q: '"Nike"', tbs: "qdr:d", gl: "gb" });
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({ sourceType: "news", publisher: "News Test", publishedAt: "2026-10-30T09:00:00.000Z", publishedPrecision: "approximate" });
    expect(r.data[1]).toMatchObject({ publishedAt: null, publishedPrecision: undefined });
  });
  it("asks for page 2 only when told to", async () => {
    const fetcher = vi.fn(async () => json({ news: [] }));
    await serperNews({ query: '"Nike"', window: "w", page: 2, apiKey: "secret-key", fetcher });
    await serperNews({ query: '"Nike"', window: "w", page: 1, apiKey: "secret-key", fetcher });
    const bodies = fetcher.mock.calls.map((c) => JSON.parse(((c as unknown as [string, RequestInit])[1]).body as string));
    expect(bodies[0].page).toBe(2);
    expect(bodies[1]).not.toHaveProperty("page");
  });
});

describe("Exa adapter for news", () => {
  it("sends the publication lower bound and news category", async () => {
    const fetcher = vi.fn(async () => json({ results: [{ title: "Adidas partners with…", url: "https://news.test/adidas", publishedDate: "2026-10-29T10:00:00.000Z", highlights: ["Adidas announced"] }] }));
    const r = await exaSearch({ query: "Adidas news", count: 8, apiKey: "secret-key", usdPerCall: 0.007, startPublishedDate: "2026-10-23T00:00:00.000Z", category: "news", fetcher });
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ startPublishedDate: "2026-10-23T00:00:00.000Z", category: "news" });
    expect(r.data[0]).toMatchObject({ sourceType: "news", publisher: "news.test", publishedAt: "2026-10-29T10:00:00.000Z" });
  });
});

describe("Watch plan", () => {
  it("plans five searches per company and a past-week window on the first check", () => {
    const tasks = buildWatchPlan([nike, adidas, puma], { keywords: [], lastSuccessAt: null, now: new Date(NOW) });
    expect(tasks).toHaveLength(15);
    expect(new Set(tasks.map((t) => t.key)).size).toBe(15);
    expect(tasks.every((t) => t.window === "w")).toBe(true);
    expect(tasks[0].since).toBe("2026-10-23T12:00:00.000Z");
    expect(tasks.filter((t) => t.provider === "exa")).toHaveLength(3);
    expect(tasks[2].query).toBe('"Nike" launch OR campaign OR partnership OR collaboration');
  });
  it("only plans a second Serper page after the first, and keeps first-page keys stable for the cache", () => {
    const tasks = buildWatchPlan([nike], { keywords: [], lastSuccessAt: null, now: new Date(NOW) });
    const p2 = tasks.filter((t) => t.page === 2);
    expect(p2.map((t) => t.afterFull)).toEqual(["n:serper:name", "n:serper:topics"]);
    for (const t of p2) expect(tasks.findIndex((x) => x.key === t.afterFull)).toBeLessThan(tasks.indexOf(t));
    expect(tasks.filter((t) => t.page === 1).map((t) => t.key)).toEqual(["n:serper:name", "n:serper:topics", "n:exa"]);
  });
  it("narrows to the past day after a recent success, with a day of overlap", () => {
    const last = new Date(NOW - 20 * 3_600_000);
    const [t] = buildWatchPlan([nike], { keywords: ["running shoes", "sustainability"], lastSuccessAt: last, now: new Date(NOW) });
    expect(t.window).toBe("d");
    expect(t.since).toBe(new Date(last.getTime() - 86_400_000).toISOString());
    const topics = buildWatchPlan([nike], { keywords: ["running shoes", "sustainability"], lastSuccessAt: last, now: new Date(NOW) })[2];
    expect(topics.query).toBe('"Nike" "running shoes" OR sustainability');
  });
  it("never skips a scheduled day, whenever the last check ran", () => {
    const next = (iso: string, f: "daily" | "weekly" = "daily") => nextCheckAt(nextRunAfter(f, new Date(iso))).toISOString();
    // Manual checks at any hour are followed by the next morning's run…
    expect(next("2026-10-30T16:20:00Z")).toBe("2026-10-31T06:00:00.000Z");
    expect(next("2026-10-30T19:41:00Z")).toBe("2026-10-31T06:00:00.000Z"); // the live case that used to skip a day
    expect(next("2026-10-30T23:59:00Z")).toBe("2026-10-31T06:00:00.000Z");
    // …unless that run is under six hours away; then the one after.
    expect(next("2026-10-31T01:00:00Z")).toBe("2026-11-01T06:00:00.000Z");
    // The scheduled run itself (anywhere in its hour) is followed by the next day's.
    expect(next("2026-10-30T06:05:00Z")).toBe("2026-10-31T06:00:00.000Z");
    expect(next("2026-10-30T06:55:00Z")).toBe("2026-10-31T06:00:00.000Z");
    expect(next("2026-10-30T06:10:00Z", "weekly")).toBe("2026-11-06T06:00:00.000Z");
    // Due half an hour before the run, so the run's "due within the hour" window always catches it.
    expect(nextRunAfter("daily", new Date("2026-10-30T19:41:00Z")).toISOString()).toBe("2026-10-31T05:30:00.000Z");
  });
});

describe("Which company a story is about", () => {
  it("matches whole words only", () => {
    expect(mentions("Nike unveils a new shoe", nike)).toBe(true);
    expect(mentions("NIKE's results", nike)).toBe(true);
    expect(mentions("Nikeland closes", nike)).toBe(false);
    expect(mentions("Pumas spotted in the hills", puma)).toBe(false);
    expect(mentions("Swoosh owner reports", { name: "Nike", aliases: ["Swoosh"] })).toBe(true);
  });
  it("prefers the searched company, falls back to another watched one, else drops the story", () => {
    expect(matchTarget({ title: "Nike and Adidas go head to head", snippet: "" }, nike, [nike, adidas])?.id).toBe("n");
    expect(matchTarget({ title: "Adidas signs a new athlete", snippet: "" }, nike, [nike, adidas, puma])?.id).toBe("a");
    expect(matchTarget({ title: "Running shoes ranked", snippet: "The best of 2026" }, nike, [nike, adidas, puma])).toBeNull();
  });
  it("keeps excerpts short", () => {
    expect(clipExcerpt("x".repeat(2000))).toHaveLength(EXCERPT_MAX);
    expect(clipExcerpt("short")).toBe("short");
    expect(clipExcerpt("# Nike and LEGO\nA new   collection")).toBe("Nike and LEGO A new collection");
  });
});
