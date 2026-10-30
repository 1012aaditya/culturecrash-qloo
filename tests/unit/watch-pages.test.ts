import { describe, expect, it, vi } from "vitest";
import { extractHtml } from "@/lib/research/deep/fetch-page";
import { youtubeVideoStats } from "@/lib/research/deep/providers/youtube";
import { classifyFetch, normalizeLines, pageDiff, pageLabel, parseFeed, summarizeChange } from "@/lib/watch/pages";
import { buildWatchPlan } from "@/lib/watch/plan";

const page = (extra: string[] = [], banner = "Free shipping on orders over $50", stamp = "Updated Oct 30, 2026 at 10:42 am") => normalizeLines([
  "Skip to main content", "Newsroom", stamp, banner,
  "PUMA and Ferrari extend partnership to 2030",
  "PUMA reports third-quarter results",
  ...extra,
  "We use cookies to improve your experience. Accept all", "© 2026 PUMA SE", "Cart (0)",
].join("\n"));

describe("page normalisation", () => {
  it("drops page furniture and masks dates, times and tracking tokens", () => {
    const lines = page();
    expect(lines).toContain("Newsroom");
    expect(lines).toContain("PUMA and Ferrari extend partnership to 2030");
    expect(lines.some((l) => /cookie|©|Cart|Skip to/i.test(l))).toBe(false);
    expect(lines).toContain("Updated <date> at <time>");
    expect(normalizeLines("Read more https://x.test/a?utm_source=mail&id=1 sid 9f86d081884c7d659a2feaa0c55ad015")[0]).toBe("Read more https://x.test/a?id=1 sid <id>");
  });
  it("keeps prices, which are meaningful on pricing pages", () => {
    expect(normalizeLines("Pro plan $49 per month")).toEqual(["Pro plan $49 per month"]);
  });
});

describe("meaningful changes", () => {
  it("ignores date-only changes and banners that rotate between messages", () => {
    const history = [page([], "Free shipping on orders over $50"), page([], "Members get 20% off this weekend")];
    expect(pageDiff(page([], "Members get 20% off this weekend", "Updated Oct 31, 2026 at 9:15 am"), history).meaningful).toBe(false);
  });
  it("reports a new press release and says what changed", () => {
    const diff = pageDiff(page(["PUMA names a new chief executive officer"]), [page()]);
    expect(diff).toMatchObject({ meaningful: true, added: ["PUMA names a new chief executive officer"], removed: [] });
    expect(summarizeChange(diff)).toBe("Added: PUMA names a new chief executive officer");
  });
  it("reports removals only when every recent snapshot had the line", () => {
    const diff = pageDiff(page().filter((l) => !l.startsWith("PUMA reports")), [page(), page()]);
    expect(diff.removed).toEqual(["PUMA reports third-quarter results"]);
    expect(diff.meaningful).toBe(true);
  });
  it("ignores tiny edits and needs a baseline before reporting anything", () => {
    expect(pageDiff([...page(), "Q4"], [page()]).meaningful).toBe(false);
    expect(pageDiff(page(), []).meaningful).toBe(false);
  });
  it("keeps summaries short", () => {
    const many = Array.from({ length: 9 }, (_, i) => `A long new product line number ${i} with plenty of words in it to fill space`);
    const s = summarizeChange({ added: many, removed: [], meaningful: true });
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s).toMatch(/\(\+5 more\)$/);
  });
});

describe("describing fetch results honestly", () => {
  const base = { error: null, text: "" };
  it("tells blocked, robots, browser-only and broken pages apart", () => {
    expect(classifyFetch({ ...base, status: "extracted", text: "x".repeat(300) }).status).toBe("ok");
    expect(classifyFetch({ ...base, status: "blocked_by_robots" }).status).toBe("robots");
    expect(classifyFetch({ status: "failed", error: "HTTP 403", text: "" }).status).toBe("blocked");
    expect(classifyFetch({ status: "failed", error: "Too little readable text", text: "JavaScript is disabled. In order to continue, we need to verify that you're not a robot." }).status).toBe("blocked");
    expect(classifyFetch({ status: "failed", error: "Too little readable text", text: "Loading" }).status).toBe("needs_browser");
    expect(classifyFetch({ status: "failed", error: "Too little readable text", text: "", httpStatus: 202 }).status).toBe("blocked");
    expect(classifyFetch({ status: "failed", error: "Too little readable text", text: "", title: "Access Denied" }).status).toBe("blocked");
    expect(classifyFetch({ status: "failed", error: "HTTP 500", text: "" })).toMatchObject({ status: "error", detail: "HTTP 500" });
  });
});

describe("feeds", () => {
  it("reads RSS with CDATA and relative links", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>PUMA News</title>
      <item><title><![CDATA[PUMA &amp; Ferrari extend partnership]]></title><link>/en/news/ferrari</link><pubDate>Wed, 29 Oct 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Through <b>2030</b>.</p>]]></description></item>
      <item><title>No link</title></item></channel></rss>`;
    expect(parseFeed(rss, "https://about.puma.com/feed.xml")).toEqual({
      title: "PUMA News",
      items: [{ title: "PUMA & Ferrari extend partnership", url: "https://about.puma.com/en/news/ferrari", publishedAt: "2026-10-29T08:00:00.000Z", summary: "Through 2030 ." }],
    });
  });
  it("reads Atom and refuses things that aren't feeds", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Nike News</title><entry><title>Nike launches Pegasus 42</title><link rel="alternate" href="https://about.nike.com/pegasus"/><updated>2026-10-28T12:00:00Z</updated><summary>New runner</summary></entry></feed>`;
    expect(parseFeed(atom, "https://about.nike.com/feed")?.items[0]).toMatchObject({ url: "https://about.nike.com/pegasus", publishedAt: "2026-10-28T12:00:00.000Z" });
    expect(parseFeed("<html><body>Hello</body></html>", "https://x.test")).toBeNull();
  });
  it("finds the feeds a page advertises", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="alternate" type="application/atom+xml" href="https://cdn.test/atom"><link rel="stylesheet" href="/a.css"></head><body><main>${"text ".repeat(60)}</main></body></html>`;
    expect(extractHtml(html, "https://brand.test/newsroom").feeds).toEqual(["https://brand.test/feed.xml", "https://cdn.test/atom"]);
  });
  it("labels pages briefly", () => {
    expect(pageLabel("https://www.puma.com/en/newsroom/")).toBe("puma.com/en/newsroom");
  });
});

describe("YouTube in the plan", () => {
  const nike = { id: "n", role: "company" as const, name: "Nike", aliases: [] };
  it("adds one YouTube search per company only when YouTube is set up", () => {
    expect(buildWatchPlan([nike], { keywords: [], lastSuccessAt: null }).some((t) => t.provider === "youtube")).toBe(false);
    const yt = buildWatchPlan([nike], { keywords: [], lastSuccessAt: null, youtube: true }).filter((t) => t.provider === "youtube");
    expect(yt).toEqual([expect.objectContaining({ key: "n:youtube", query: '"Nike"' })]);
  });
  it("reads public counts for up to 50 videos in one call", async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [{ id: "v1", statistics: { viewCount: "1200", likeCount: "40" } }] }));
    const r = await youtubeVideoStats({ ids: Array.from({ length: 60 }, (_, i) => `v${i}`), apiKey: "secret-key", fetcher });
    const url = new URL((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("id")!.split(",")).toHaveLength(50);
    expect(r).toMatchObject({ ok: true, units: 1, data: { v1: { views: 1200, likes: 40 } } });
  });
});
