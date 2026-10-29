import { describe, expect, it } from "vitest";
import { Budget, DEPTH_PROFILES, llmCostUsd } from "@/lib/research/deep/budget";
import { cacheKey } from "@/lib/research/deep/cache";
import { dedupe, independentCount, isRepeatQuery, mergeClaims } from "@/lib/research/deep/dedupe";
import { scoreClaim } from "@/lib/research/deep/quality";
import { assertPublicUrl, canonicalizeUrl, isPrivateAddress } from "@/lib/research/deep/url";

describe("URL canonicalisation", () => {
  it("normalises scheme, host, tracking params, fragments, trailing slashes and AMP", () => {
    expect(canonicalizeUrl("http://WWW.Example.com/Story/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/Story?a=1&b=2");
    expect(canonicalizeUrl("https://example.com/news/item/amp/")).toBe("https://example.com/news/item");
    expect(canonicalizeUrl("https://m.example.com/a?fbclid=1")).toBe("https://example.com/a");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
  });
});

describe("SSRF guard", () => {
  const resolveTo = (address: string) => async () => [{ address }];
  it("rejects private, loopback, link-local and metadata addresses", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    await expect(assertPublicUrl("https://evil.test/", resolveTo("169.254.169.254"))).rejects.toThrow(/Private/);
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow();
    await expect(assertPublicUrl("https://example.test:8443/")).rejects.toThrow(/ports/);
    await expect(assertPublicUrl("ftp://example.test/")).rejects.toThrow();
    await expect(assertPublicUrl("https://news.test/a", resolveTo("93.184.216.34"))).resolves.toBeInstanceOf(URL);
  });
});

describe("deduplication and independence", () => {
  const press = "Brand X today announced a refillable skincare line made with recycled glass, available in 40 cities from March with a launch campaign.";
  it("drops exact duplicates, groups syndicated copies, keeps independent sources apart", () => {
    const out = dedupe([
      { key: "a", url: "https://news-a.test/x?utm_source=feed", title: "Brand X launches refills", text: press, publisher: "A" },
      { key: "b", url: "https://news-a.test/x", title: "Brand X launches refills", text: press, publisher: "A" },              // same URL
      { key: "c", url: "https://news-b.test/y", title: "Brand X launches refills", text: `${press} Copyright News B.`, publisher: "B" }, // syndicated
      { key: "d", url: "https://forum.test/t", title: "Thoughts on refills?", text: "I tried the refills and the glass jar feels premium but the pump leaks every time.", publisher: "Forum" },
    ]);
    const by = Object.fromEntries(out.map((o) => [o.key, o]));
    expect(by.b.duplicateOf).toBe("a");
    expect(by.c.duplicateOf).toBeNull();
    expect(by.c.group).toBe(by.a.group);
    expect(by.d.group).not.toBe(by.a.group);
    expect(independentCount(["a", "c", "d"], (id) => by[id].group)).toBe(2);
  });
  it("merges near-identical claims while keeping every supporting document", () => {
    const merged = mergeClaims([
      { text: "Gen Z buyers prefer short skincare routines with fewer products", documentIds: ["d1"] },
      { text: "Gen Z buyers prefer short skincare routines with fewer products.", documentIds: ["d2"] },
      { text: "Clinical efficacy is the main competitor message", documentIds: ["d3"] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].documentIds).toEqual(["d1", "d2"]);
  });
  it("detects repeated follow-up queries", () => {
    expect(isRepeatQuery("skincare routine frustrations India", ["India skincare routine frustrations"])).toBe(true);
    expect(isRepeatQuery("competitor clinical positioning", ["skincare routine frustrations"])).toBe(false);
  });
  it("cache keys depend on provider, normalised query and parameters", () => {
    expect(cacheKey("brave", "Skincare  India!", { country: "in" })).toBe(cacheKey("brave", "skincare india", { country: "in" }));
    expect(cacheKey("brave", "skincare india", { country: "in" })).not.toBe(cacheKey("brave", "skincare india", { country: "us" }));
    expect(cacheKey("brave", "q", {})).not.toBe(cacheKey("tavily", "q", {}));
  });
});

describe("evidence quality", () => {
  const base = { claim: "Gen Z in India prefer short skincare routines", claimType: "source_fact" as const, question: "What do Gen Z in India value in skincare?", documentText: "Survey: Gen Z in India prefer short skincare routines with two products.", sourceType: "news" as const, geography: "India", hasPublisher: true, now: new Date("2026-10-30") };
  it("rewards verbatim support, recency, geography and corroboration — and explains itself", () => {
    const strong = scoreClaim({ ...base, excerpt: "Gen Z in India prefer short skincare routines", publishedAt: "2026-09-01", independentSources: 3 });
    const weak = scoreClaim({ ...base, excerpt: "invented quote", publishedAt: null, independentSources: 1, documentText: "Unrelated text" });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.directness).toBe(1);
    expect(weak.notes.join(" ")).toMatch(/not found verbatim/);
    expect(weak.notes.join(" ")).toMatch(/single independent source/);
    expect(weak.notes.join(" ")).toMatch(/Publication date unknown/);
  });
  it("judges credibility by claim type: community posts are strong for opinions, weak for facts", () => {
    const opinion = scoreClaim({ ...base, sourceType: "community_post", claimType: "source_opinion", excerpt: null, publishedAt: null, independentSources: 1 });
    const fact = scoreClaim({ ...base, sourceType: "community_post", claimType: "source_fact", excerpt: null, publishedAt: null, independentSources: 1 });
    expect(opinion.credibility).toBeGreaterThan(fact.credibility);
  });
});

describe("budget", () => {
  it("stops optional work before eating the synthesis reserve, and enforces call limits", () => {
    const b = new Budget({ ...DEPTH_PROFILES.quick, maxUsd: 0.1, synthesisReserveUsd: 0.05, maxProviderCalls: 2 });
    expect(b.canSpend("provider", 0.01).ok).toBe(true);
    b.record("brave", { ok: true, units: 1, usdEstimated: 0.04, usdActual: null, ms: 10 });
    expect(b.canSpend("provider", 0.02)).toEqual({ ok: false, reason: "budget_limit" });
    b.record("brave", { ok: false, units: 1, usdEstimated: 0, usdActual: null, ms: 10 });
    expect(b.canSpend("provider", 0)).toEqual({ ok: false, reason: "provider_call_limit" });
    expect(b.canSynthesize(0.05)).toBe(true);
    expect(b.usage.failedCalls).toBe(1);
    expect(b.usage.byProvider.brave.calls).toBe(2);
  });
  it("respects the workspace's remaining monthly budget and the time limit", () => {
    expect(new Budget(DEPTH_PROFILES.deep, 0.2).canSpend("provider", 0.01)).toEqual({ ok: false, reason: "budget_limit" });
    let t = 0;
    const b = new Budget(DEPTH_PROFILES.quick, Infinity, () => t);
    t = DEPTH_PROFILES.quick.maxSeconds * 1000;
    expect(b.canSpend("provider", 0).reason).toBe("time_limit");
  });
  it("prices LLM tokens per model", () => {
    expect(llmCostUsd("claude-haiku-5-5", 1_000_000, 0)).toBeCloseTo(0.1);
    expect(llmCostUsd("claude-opus-5-5", 0, 1_000_000)).toBeCloseTo(20);
  });
});
