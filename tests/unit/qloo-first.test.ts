import { describe, expect, it, vi } from "vitest";
import type { BriefInput } from "@/lib/ai/template";
import { errorCategory } from "@/lib/research/deep/health";
import { buildPlanV2, mergeQuestions, pickQlooEntities, qlooQuestions, rulesPlan, selectProviders } from "@/lib/research/deep/planner";
import { isTechBrief, type ProviderInfo } from "@/lib/research/deep/registry";
import { rulesSynthesis, templateOpportunity, type QlooObservation } from "@/lib/research/deep/synthesize";
import type { QlooPick } from "@/lib/research/deep/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: () => ({}) }));

const brief: BriefInput = { name: "Launch", brand: "Lumen", product: "Serum", category: "Skincare", market: "India", audience: "Gen Z in metro cities", objective: "Awareness", existingPositioning: null, competitors: ["Nykaa"], brandGuidelines: null, budgetRange: null, timeframe: null, additionalContext: null, interests: [] };
const pick = (id: string, name: string, type: string, affinity: number | null, extra: Partial<QlooPick> = {}): QlooPick => ({ entityId: id, evidenceId: `ev-${id}`, name, type, role: "result", affinity, popularity: 0.4, tier: null, ...extra });
const info = (key: ProviderInfo["key"], capability: ProviderInfo["capability"], configured = true): ProviderInfo => ({ key, label: key, capability, strengths: "", configured, unavailableReason: configured ? null : "not set", costModel: "", cacheTtlHours: 24, terms: "", verified: "contract_only" });

describe("Qloo seeds the research", () => {
  const rows: QlooPick[] = [
    pick("a1", "Velvet Hours", "artist", 0.91), pick("a2", "Neon Monsoon", "artist", 0.9), pick("b1", "Seoul Dew Lab", "brand", 0.88),
    pick("p1", "Matcha House", "place", 0.7, { tier: "white_space" }), pick("t1", "Clean beauty", "tag", 0.8, { role: "tag" }), pick("x", "No affinity", "movie", null),
  ];
  it("picks high-affinity results with type diversity, prefers white space slightly, and adds the top taste tag", () => {
    const two = pickQlooEntities(rows, 2);
    expect(two.map((p) => p.name)).toEqual(["Velvet Hours", "Clean beauty"]);
    const four = pickQlooEntities(rows, 4);
    expect(new Set(four.map((p) => p.type)).size).toBe(4);           // artist, brand, place, tag — not two artists
    expect(four.map((p) => p.name)).not.toContain("No affinity");    // never picks an entity without returned affinity
    expect(pickQlooEntities([], 3)).toEqual([]);
  });
  it("turns each pick into a question routed by entity type, carrying its Qloo provenance", () => {
    const qs = qlooQuestions(pickQlooEntities(rows, 4), brief);
    const artist = qs.find((q) => q.text.includes("Velvet Hours"))!;
    expect(artist).toMatchObject({ origin: "qloo", intent: "creator", qlooEntityIds: ["a1"], qlooEvidenceIds: ["ev-a1"] });
    expect(artist.text).toMatch(/affinity 0\.91/);
    expect(qs.find((q) => q.text.includes("Clean beauty"))!.intent).toBe("community");
    expect(qs.find((q) => q.text.includes("Seoul Dew Lab"))!.intent).toBe("competitor");
  });
  it("puts Qloo questions first within the depth cap and re-keys everything", () => {
    const merged = mergeQuestions(qlooQuestions(pickQlooEntities(rows, 2), brief), rulesPlan(brief, { objective: null, depth: "standard", freshness: "year", hasBrandDocs: false }), "standard");
    expect(merged).toHaveLength(5);
    expect(merged.slice(0, 2).every((q) => q.origin === "qloo")).toBe(true);
    expect(merged.map((q) => q.key)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(merged[2].origin).toBe("brief");
  });
  it("says when Qloo could not seed the plan", () => {
    const plan = buildPlanV2(brief, { objective: null, depth: "quick", freshness: "year", hasBrandDocs: false, registry: [info("serper", "web_search")], demo: false, qlooQuestions: [] });
    expect(plan.notes.join(" ")).toMatch(/No Qloo results were available/);
  });
});

describe("relevance-based routing", () => {
  const registry = [info("serper", "web_search"), info("exa", "semantic_search"), info("youtube", "video"), info("reddit", "community"), info("hacker_news", "tech_community"), info("google_suggest", "search_language", false), info("wikipedia", "encyclopedia"), info("brand_docs", "brand_context")];
  const qs = rulesPlan(brief, { objective: null, depth: "deep", freshness: "year", hasBrandDocs: false });
  it("uses Hacker News only for technology briefs", () => {
    expect(selectProviders(qs, registry, false, { tech: false }).providers).not.toContain("hacker_news");
    expect(selectProviders(qs, registry, false, { tech: false }).skipped.find((s) => s.provider === "hacker_news")?.reason).toMatch(/technology/);
    expect(selectProviders(qs, registry, false, { tech: true }).providers).toContain("hacker_news");
    expect(isTechBrief("AI note-taking app for startups")).toBe(true);
    expect(isTechBrief("Premium skincare serum")).toBe(false);
  });
  it("uses Serper for keyword search and Exa only as the semantic complement — never the same provider twice", () => {
    const sel = selectProviders(qs, registry, false);
    const culture = qs.find((q) => q.intent === "culture" || q.intent === "counterevidence")!;
    expect(sel.byQuestion[culture.key]).toEqual(expect.arrayContaining(["serper", "exa"]));
    for (const ps of Object.values(sel.byQuestion)) {
      expect(new Set(ps).size).toBe(ps.length);
      expect(ps.length).toBeLessThanOrEqual(3);
    }
    // With Exa as the only web provider it is the web search, not also a "complement".
    const exaOnly = selectProviders(qs, registry.filter((p) => p.key !== "serper"), false);
    expect(Object.values(exaOnly.byQuestion).flat().filter((p) => p === "exa").length).toBeGreaterThan(0);
    expect(exaOnly.byQuestion[culture.key].filter((p) => p === "exa")).toHaveLength(1);
  });
  it("skips unconfigured providers with their reason (Google suggestions are off by default)", () => {
    expect(selectProviders(qs, registry, false).skipped.find((s) => s.provider === "google_suggest")?.reason).toBe("not set");
  });
});

describe("opportunities without an LLM", () => {
  const qloo: QlooObservation[] = [{ id: "ev-a1", entity: "Velvet Hours", type: "artist", affinity: 0.91, popularity: 0.3, questionKey: "q1", claim: "Velvet Hours (artist), affinity 0.91" }];
  const claims = [{ id: "c1", text: "Velvet Hours fans post skincare routines", type: "source_opinion", score: 0.6, independent: 1, questionKey: "q1", sources: ["r/x"] }];
  it("builds one exploratory template hypothesis on the strongest Qloo observation, with experiment and metrics", () => {
    const [o] = templateOpportunity(qloo, claims, brief);
    expect(o).toMatchObject({ qlooEvidenceIds: ["ev-a1"], supportingClaimIds: ["c1"], exploratory: true });
    expect(o.thesis).toMatch(/not evidence of demand/);
    expect(o.validation).toMatch(/A\/B test/);
    expect(o.successMetrics.length).toBeGreaterThan(0);
    expect(o.brandFit).toMatch(/Not assessed/);
    expect(templateOpportunity([], claims, brief)).toEqual([]);
  });
  it("rules synthesis cites the Qloo observation for Qloo-seeded questions", () => {
    const s = rulesSynthesis([{ key: "q1", text: "Velvet Hours?", intent: "creator", priority: 1, queries: [], origin: "qloo", qlooEvidenceIds: ["ev-a1"] }], claims,
      [{ key: "q1", question: "Velvet Hours?", priority: 1, claims: 1, independent: 1, status: "thin" }], qloo, brief);
    expect(s.findings[0]).toMatchObject({ claimIds: ["ev-a1"], statement: expect.stringMatching(/^Observed in Qloo/) });
    expect(s.opportunities).toHaveLength(1);
  });
});

describe("provider health", () => {
  it("categorises errors without conflating them", () => {
    expect(errorCategory(401, "HTTP 401")).toBe("authentication");
    expect(errorCategory(429, "HTTP 429")).toBe("rate limited");
    expect(errorCategory(200, "Unexpected response shape: x")).toBe("invalid response");
    expect(errorCategory(503, "HTTP 503")).toBe("provider error");
    expect(errorCategory(null, "Timed out")).toBe("timeout");
    expect(errorCategory(null, "Network error")).toBe("network");
  });
});
