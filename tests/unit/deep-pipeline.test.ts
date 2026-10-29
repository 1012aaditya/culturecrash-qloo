import { describe, expect, it, vi } from "vitest";
import type { BriefInput } from "@/lib/ai/template";
import { rulesExtraction, validateExtraction, type ExtractDoc } from "@/lib/research/deep/extract";
import { extractHtml, fetchPage, parseRobots } from "@/lib/research/deep/fetch-page";
import { buildPlanV2, countryCode, inferIntent, rulesPlan, sanitizeLlmPlan, selectProviders } from "@/lib/research/deep/planner";
import type { ProviderInfo } from "@/lib/research/deep/registry";
import { rulesSynthesis, validateSynthesis } from "@/lib/research/deep/synthesize";

vi.mock("@/lib/env", () => ({ env: () => ({}) }));

const brief: BriefInput = { name: "Launch", brand: "Lumen", product: "Serum", category: "Skincare", market: "India", audience: "Gen Z in metro cities", objective: "Awareness", existingPositioning: null, competitors: ["Nykaa"], brandGuidelines: null, budgetRange: null, timeframe: null, additionalContext: null, interests: ["K-pop"] };
const info = (key: ProviderInfo["key"], capability: ProviderInfo["capability"], configured: boolean): ProviderInfo => ({ key, label: key, capability, strengths: "", configured, unavailableReason: configured ? null : `${key} not set`, costModel: "", cacheTtlHours: 24, terms: "", verified: "contract_only" });
const registry = [info("brave", "web_search", true), info("tavily", "web_search", false), info("exa", "web_search", false), info("youtube", "video", false), info("reddit", "community", false), info("wikipedia", "encyclopedia", true), info("brand_docs", "brand_context", true)];

describe("planner", () => {
  it("builds distinct, prioritised questions adapted to the brief and depth", () => {
    const quick = rulesPlan(brief, { objective: null, depth: "quick", freshness: "year", hasBrandDocs: false, year: 2026 });
    expect(quick).toHaveLength(3);
    expect(quick.map((q) => q.priority)).toEqual([...quick.map((q) => q.priority)].sort()); // most important first
    expect(quick.filter((q) => q.priority === 1)).toHaveLength(2);
    expect(quick.map((q) => q.intent)).toContain("competitor");
    const deep = rulesPlan(brief, { objective: "Why do Gen Z buyers drop long routines?", depth: "deep", freshness: "year", hasBrandDocs: true, year: 2026 });
    expect(deep[0].text).toMatch(/drop long routines/);
    expect(deep.map((q) => q.intent)).toEqual(expect.arrayContaining(["brand_context", "counterevidence"]));
    expect(new Set(deep.map((q) => q.key)).size).toBe(deep.length);
    const noComp = rulesPlan({ ...brief, competitors: [] }, { objective: null, depth: "standard", freshness: "year", hasBrandDocs: false });
    expect(noComp.map((q) => q.intent)).not.toContain("competitor");
  });
  it("routes questions to configured providers only, and explains what was skipped", () => {
    const qs = rulesPlan(brief, { objective: null, depth: "deep", freshness: "year", hasBrandDocs: true, year: 2026 });
    const sel = selectProviders(qs, registry, false);
    expect(sel.providers).toEqual(expect.arrayContaining(["brave", "brand_docs", "wikipedia"]));
    expect(sel.providers).not.toContain("youtube");
    expect(sel.skipped.find((s) => s.provider === "reddit")?.reason).toMatch(/not set/);
    expect(sel.byQuestion[qs.find((q) => q.intent === "brand_context")!.key]).toEqual(["brand_docs"]);
    // Demo runs use only the labelled fixtures, never live providers.
    expect(selectProviders(qs, [...registry, info("demo_web", "web_search", true)], true).providers.every((p) => p === "demo_web" || p === "brand_docs")).toBe(true);
  });
  it("notes when no external source is configured", () => {
    const none = registry.map((r) => (r.key === "brand_docs" ? r : { ...r, configured: false }));
    const plan = buildPlanV2(brief, { objective: null, depth: "standard", freshness: "year", hasBrandDocs: false, registry: none, demo: false });
    expect(plan.notes.join(" ")).toMatch(/No web, video or community provider/);
  });
  it("sanitises an LLM plan: caps counts, drops brand questions without documents, clamps priority", () => {
    const qs = sanitizeLlmPlan({ questions: [
      { text: "What do competitors say about refills?", intent: "competitor", priority: 9, queries: ["competitor refills", "b", "c"] },
      { text: "What do our brand docs say?", intent: "brand_context", priority: 1, queries: ["brand"] },
      { text: "short", intent: "culture", priority: 1, queries: ["x"] },
    ] }, "quick", false);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ key: "q1", priority: 3 });
    expect(qs[0].queries).toHaveLength(1);
  });
  it("infers intents and country codes", () => {
    expect(inferIntent("How does Nykaa position itself vs Sephora?")).toBe("competitor");
    expect(inferIntent("Is clean beauty still growing?")).toBe("trend");
    expect(countryCode("Mumbai, India")).toBe("in");
    expect(countryCode("Mars")).toBeNull();
  });
});

describe("claim extraction", () => {
  const docs: ExtractDoc[] = [
    { index: 0, title: "Report", publisher: "News A", publishedAt: null, sourceType: "news", questionKeys: ["q1"], text: "A 2026 survey found that 62% of Gen Z respondents in Mumbai use three or fewer skincare products. Many said routines should feel calm, not like homework." },
    { index: 1, title: "Thread", publisher: "r/IndianSkincareAddicts", publishedAt: null, sourceType: "community_post", questionKeys: ["q2"], text: "Honestly ten step routines feel like homework and I gave up on them last year. Now I only use what actually works for my skin." },
  ];
  const qs = [{ key: "q1", text: "What do Gen Z value in skincare?", intent: "audience" as const, priority: 1 as const, queries: ["gen z skincare routine"] }, { key: "q2", text: "What frustrates people about skincare routines?", intent: "community" as const, priority: 2 as const, queries: ["skincare routine frustration"] }];
  it("keeps only citations to real documents and verbatim excerpts", () => {
    const out = validateExtraction({ claims: [
      { text: "62% of Gen Z respondents in Mumbai use three or fewer products", claimType: "observed_measurement", documentIndexes: [0, 7], excerpt: "62% of Gen Z respondents in Mumbai use three or fewer skincare products", questionKey: "q1", geography: "Mumbai", audience: "Gen Z", period: "2026" },
      { text: "Users say long routines feel like homework", claimType: "source_opinion", documentIndexes: [1], excerpt: "a quote that is not in the text", questionKey: "zzz", geography: "", audience: "", period: "" },
      { text: "Invented claim citing nothing real", claimType: "source_fact", documentIndexes: [5], excerpt: "", questionKey: "q1", geography: "", audience: "", period: "" },
    ] }, docs, qs);
    expect(out).toHaveLength(2);
    expect(out[0].documentIndexes).toEqual([0]);
    expect(out[0].excerpt).toMatch(/^62%/);
    expect(out[1].excerpt).toBeNull();
    expect(out[1].questionKey).toBe("q2");
  });
  it("rules fallback quotes relevant sentences verbatim and labels opinions", () => {
    const out = rulesExtraction(docs, qs);
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(docs[c.documentIndexes[0]].text).toContain(c.excerpt!);
    expect(out.find((c) => c.documentIndexes[0] === 1)?.claimType).toBe("source_opinion");
  });
});

const opp = { title: "", thesis: "t", audience: "a", qlooEvidenceIds: [] as string[], supportingClaimIds: [] as string[], counterClaimIds: [] as string[], audienceRelevance: "", brandFit: "", creativeDirection: "", assumptions: [], risks: [], evidenceGaps: [], validation: "test", successMetrics: [], exploratory: false };

describe("synthesis", () => {
  const claims = [{ id: "c1", text: "A", type: "source_fact", score: 0.7, independent: 2, questionKey: "q1", sources: ["X"] }, { id: "c2", text: "B", type: "source_opinion", score: 0.5, independent: 1, questionKey: "q1", sources: ["Y"] }];
  it("drops findings and opportunities that cite nothing real, and one-sided contradictions", () => {
    const s = validateSynthesis({
      summary: "s",
      findings: [{ statement: "ok", kind: "supported", claimIds: ["c1", "fake"], questionKey: "q1", strength: "strong" }, { statement: "unsupported", kind: "interpretation", claimIds: ["fake"], questionKey: "q1", strength: "weak" }],
      contradictions: [{ claimIds: ["c1", "fake"], explanation: "x" }, { claimIds: ["c1", "c2"], explanation: "y" }],
      gaps: [{ questionKey: "q9", description: "?" }],
      opportunities: [
        { ...opp, title: "T", supportingClaimIds: ["c1"], counterClaimIds: ["fake"], qlooEvidenceIds: ["qloo-1", "fake-q"] },
        { ...opp, title: "U", supportingClaimIds: ["nope"] },
        { ...opp, title: "Q", supportingClaimIds: [], qlooEvidenceIds: ["qloo-1"] },
      ],
      limitations: [],
    }, new Set(["c1", "c2"]), new Set(["q1"]), new Set(["qloo-1"]));
    expect(s.findings).toHaveLength(1);
    expect(s.findings[0].claimIds).toEqual(["c1"]);
    expect(s.contradictions).toHaveLength(1);
    expect(s.gaps).toHaveLength(0);
    // Kept: one with web support, one built only on a Qloo observation. Dropped: one citing nothing real.
    expect(s.opportunities.map((o) => o.title)).toEqual(["T", "Q"]);
    expect(s.opportunities[0]).toMatchObject({ counterClaimIds: [], qlooEvidenceIds: ["qloo-1"], exploratory: true }); // one supporting claim → exploratory
    expect(s.opportunities[1].supportingClaimIds).toEqual([]);
  });
  it("rules synthesis restates claims and reports gaps; without Qloo data it invents no opportunities", () => {
    const s = rulesSynthesis([{ key: "q1", text: "Q1", intent: "audience", priority: 1, queries: [] }, { key: "q2", text: "Q2", intent: "trend", priority: 2, queries: [] }], claims,
      [{ key: "q1", question: "Q1", priority: 1, claims: 2, independent: 2, status: "sufficient" }, { key: "q2", question: "Q2", priority: 2, claims: 0, independent: 0, status: "none" }]);
    expect(s.findings.map((f) => f.claimIds[0])).toEqual(["c1", "c2"]);
    expect(s.opportunities).toEqual([]);
    expect(s.gaps).toEqual([{ questionKey: "q2", description: "No supporting source was found." }]);
  });
});

describe("page retrieval", () => {
  const html = `<html lang="en"><head><title>Ignored</title><meta property="og:title" content="Gen Z &amp; skincare"><meta property="og:site_name" content="News A">
    <meta property="article:published_time" content="2026-09-01T10:00:00Z"><link rel="canonical" href="https://news-a.test/story"></head>
    <body><nav>Menu Home About</nav><script>evil()</script><article><p>${"Readable paragraph about routines. ".repeat(12)}</p></article><footer>©</footer></body></html>`;
  it("extracts readable text and provenance without scripts or navigation", () => {
    const ex = extractHtml(html);
    expect(ex.title).toBe("Gen Z & skincare");
    expect(ex.publisher).toBe("News A");
    expect(ex.publishedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(ex.canonical).toBe("https://news-a.test/story");
    expect(ex.language).toBe("en");
    expect(ex.text).toContain("Readable paragraph");
    expect(ex.text).not.toMatch(/evil|Menu Home/);
  });
  it("parses robots.txt for the * group", () => {
    expect(parseRobots("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nAllow: /\n")).toEqual(["/private"]);
  });
  const publicDns = async () => [{ address: "93.184.216.34" }];
  it("honours robots.txt, follows safe redirects only, and skips non-HTML", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /blocked", { status: 200 });
      if (url.includes("/redirect")) return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      if (url.includes("/pdf")) return new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    });
    const resolve = async (h: string) => (h === "169.254.169.254" ? [{ address: h }] : publicDns());
    expect((await fetchPage("https://site1.test/blocked/page", { fetcher, resolve })).status).toBe("blocked_by_robots");
    const redirected = await fetchPage("https://site2.test/redirect", { fetcher, resolve });
    expect(redirected.status).toBe("failed");
    expect(redirected.error).toMatch(/Private/);
    expect((await fetchPage("https://site3.test/pdf", { fetcher, resolve })).status).toBe("skipped");
    const ok = await fetchPage("https://site4.test/story", { fetcher, resolve });
    expect(ok.status).toBe("extracted");
    expect(fetcher.mock.calls.some(([u]) => String(u).includes("169.254"))).toBe(false);
  });
});
