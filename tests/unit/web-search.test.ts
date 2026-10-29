import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  searchReddit,
  searchWikipedia,
  searchWikidata,
  searchMultiCulturalIntelligence,
} from "@/lib/research/web-search";

describe("Multi-Source Cultural Web Search Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("searchWikipedia parses Wikimedia search API responses into encyclopedic items", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          search: [
            {
              title: "Cottagecore",
              snippet: "Cottagecore is an <span class=\"searchmatch\">aesthetic</span> and fashion movement...",
            },
          ],
        },
      }),
    });

    const results = await searchWikipedia("Cottagecore", 1);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Cottagecore");
    expect(results[0].url).toBe("https://en.wikipedia.org/wiki/Cottagecore");
    expect(results[0].category).toBe("encyclopedic");
    expect(results[0].snippet).toContain("Cottagecore is an aesthetic");
    expect(results[0].snippet).not.toContain("<span");
  });

  it("searchWikidata parses Wikidata entity responses into knowledge graph items", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        search: [
          {
            id: "Q96375589",
            label: "cottagecore",
            description: "nostalgic Internet aesthetic celebrating a return to traditional skills",
            url: "//www.wikidata.org/wiki/Q96375589",
          },
        ],
      }),
    });

    const results = await searchWikidata("Cottagecore", 1);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("cottagecore (Q96375589)");
    expect(results[0].url).toBe("https://www.wikidata.org/wiki/Q96375589");
    expect(results[0].category).toBe("encyclopedic");
    expect(results[0].source).toBe("Wikidata (Knowledge Graph)");
    expect(results[0].snippet).toContain("Q96375589");
  });

  it("searchReddit parses RSS feeds into community sentiment items", async () => {
    const mockRss = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Anyone else obsessed with analog audio lately?</title>
        <link href="https://www.reddit.com/r/audiophile/comments/123/analog_audio/"/>
        <published>2026-03-15T12:00:00Z</published>
        <category label="r/audiophile"/>
        <content type="html">&lt;p&gt;Vinyl warmth hits different than streaming.&lt;/p&gt;</content>
      </entry>
    </feed>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockRss,
    });

    const results = await searchReddit("audiophile", 1);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Anyone else obsessed with analog audio lately?");
    expect(results[0].url).toContain("reddit.com/r/audiophile");
    expect(results[0].category).toBe("community");
    expect(results[0].source).toBe("Reddit (r/audiophile)");
    expect(results[0].snippet).toContain("Vinyl warmth");
  });

  it("searchMultiCulturalIntelligence aggregates and deduplicates parallel searches", async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("wikipedia.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            query: { search: [{ title: "Indie Sleaze", snippet: "Indie sleaze fashion..." }] },
          }),
        });
      }
      if (urlStr.includes("wikidata.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            search: [{ id: "Q111", label: "Indie sleaze", description: "fashion trend", url: "//www.wikidata.org/wiki/Q111" }],
          }),
        });
      }
      if (urlStr.includes("reddit.com")) {
        return Promise.resolve({
          ok: true,
          text: async () => `
            <feed>
              <entry>
                <title>Indie Sleaze Revival</title>
                <link href="https://www.reddit.com/r/fashion/comments/999/indie_sleaze/"/>
                <content>Flash photography and grunge aesthetic</content>
              </entry>
            </feed>`,
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => `<rss><channel></channel></rss>`,
        json: async () => ({}),
      });
    });

    const results = await searchMultiCulturalIntelligence("Indie Sleaze");
    expect(results.length).toBeGreaterThanOrEqual(2);
    const categories = results.map((r) => r.category);
    expect(categories).toContain("encyclopedic");
    expect(categories).toContain("community");
  });
});
