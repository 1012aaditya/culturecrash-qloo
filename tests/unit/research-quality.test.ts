import { describe, expect, it } from "vitest";
import { Budget, DEPTH_PROFILES, synthesisEstimateUsd } from "@/lib/research/deep/budget";
import { mergeQuestions, pickQlooEntities, shareAcross } from "@/lib/research/deep/planner";
import { demoSearch } from "@/lib/research/deep/providers/demo";
import type { QlooPick, ResearchQuestion } from "@/lib/research/deep/types";

const q = (key: string, intent: ResearchQuestion["intent"], priority: 1 | 2 | 3, origin?: ResearchQuestion["origin"]): ResearchQuestion =>
  ({ key, text: `${intent} question ${key}`, intent, priority, origin, queries: [`${intent} query ${key}`] });

describe("mergeQuestions", () => {
  const qloo = [1, 2, 3, 4].map((i) => q(`k${i}`, "creator", 1, "qloo"));
  const brief = [q("u", "audience", 1, "user"), q("a", "audience", 1), q("c", "competitor", 1), q("ce", "counterevidence", 2), q("t", "trend", 2)];

  it("always keeps the user's question and the counter-evidence question", () => {
    for (const depth of ["quick", "standard", "deep"] as const) {
      const out = mergeQuestions(qloo, brief, depth);
      expect(out.some((x) => x.origin === "user"), depth).toBe(true);
      expect(out.some((x) => x.intent === "counterevidence"), depth).toBe(true);
    }
  });

  it("keeps a slot for a brief question when Qloo could fill everything", () => {
    const out = mergeQuestions(qloo, brief, "standard"); // cap 5
    expect(out).toHaveLength(5);
    expect(out.filter((x) => x.origin === "qloo")).toHaveLength(2);
    expect(out.some((x) => x.intent === "audience" && x.origin === "brief")).toBe(true);
    expect(out.map((x) => x.key)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });
});

describe("shareAcross", () => {
  it("gives every group a turn before any gets a second", () => {
    expect(shareAcross([["a1", "a2", "a3", "a4"], ["b1"], ["c1", "c2"]], 4)).toEqual(["a1", "b1", "c1", "a2"]);
    expect(shareAcross([["a1"], []], 5)).toEqual(["a1"]);
  });
});

describe("pickQlooEntities", () => {
  const pick = (name: string, type: string, affinity: number | null, extra: Partial<QlooPick> = {}): QlooPick =>
    ({ entityId: name, evidenceId: `ev-${name}`, name, type, role: "result", affinity, popularity: null, tier: null, ...extra });

  it("rotates through entity types instead of ranking scores from different queries together", () => {
    const rows = [pick("a1", "artist", 0.99), pick("a2", "artist", 0.98), pick("a3", "artist", 0.97), pick("b1", "brand", 0.6), pick("p1", "place", 0.5)];
    expect(pickQlooEntities(rows, 3).map((p) => p.name)).toEqual(["a1", "b1", "p1"]);
  });

  it("never picks second-hop orbit entities and adds the strongest taste tag", () => {
    const rows = [pick("orbit", "brand", 0.99, { tier: "subcultural_orbit" }), pick("a1", "artist", 0.7), pick("t1", "tag", 0.8, { role: "tag" }), pick("t2", "tag", 0.9, { role: "tag" })];
    const out = pickQlooEntities(rows, 2).map((p) => p.name);
    expect(out).not.toContain("orbit");
    expect(out).toEqual(["a1", "t2"]);
  });
});

describe("budget", () => {
  it("doesn't count cache hits against the provider-call limit", () => {
    const b = new Budget({ ...DEPTH_PROFILES.quick, maxProviderCalls: 1 });
    b.record("brave", { ok: true, kind: "cache", units: 0, usdEstimated: 0, usdActual: null, ms: 0 });
    expect(b.canSpend("provider", 0).ok).toBe(true);
    b.record("brave", { ok: true, units: 1, usdEstimated: 0.005, usdActual: null, ms: 10 });
    expect(b.canSpend("provider", 0)).toEqual({ ok: false, reason: "provider_call_limit" });
  });

  it("reserves enough for a realistic synthesis with the default model", () => {
    expect(synthesisEstimateUsd("claude-opus-5-5", "standard")).toBeLessThanOrEqual(DEPTH_PROFILES.standard.synthesisReserveUsd);
    expect(synthesisEstimateUsd("claude-opus-5-5", "deep")).toBeLessThanOrEqual(DEPTH_PROFILES.deep.synthesisReserveUsd);
    expect(synthesisEstimateUsd("claude-haiku-5-5", "quick")).toBeLessThanOrEqual(DEPTH_PROFILES.quick.synthesisReserveUsd);
  });
});

describe("demo search", () => {
  it("returns sources that match the query, the same way every time", () => {
    const backlash = demoSearch("skincare backlash criticism").data.map((h) => h.url);
    const competitor = demoSearch("competitor brand positioning campaign").data.map((h) => h.url);
    expect(backlash[0]).toContain("clean-beauty-backlash");
    expect(competitor.some((u) => u?.includes("brand.example.org") || u?.includes("competitor-b"))).toBe(true);
    expect(backlash).not.toEqual(competitor);
    expect(demoSearch("skincare backlash criticism").data.map((h) => h.url)).toEqual(backlash);
  });
});
