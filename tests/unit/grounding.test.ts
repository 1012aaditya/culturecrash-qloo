import { describe, expect, it } from "vitest";
import { checkStatement, checkStatements, citedIds, groundingScore } from "@/lib/ai/grounding";
import { templateStrategy, type BriefInput, type Observation } from "@/lib/ai/template";

const evidence = new Map([
  ["ev-1", "Arijit Singh — Qloo returned Arijit Singh with affinity 0.91 for the Lumen signal in India."],
  ["ev-2", "Vogue India reported that 62% of Gen Z skincare buyers in Mumbai follow K-beauty creators."],
  ["ev-3", "Lo-fi study playlists are the most saved music category among Indian college students."],
]);

describe("checkStatement", () => {
  it("verifies a statement whose names and numbers appear in the cited text", () => {
    expect(checkStatement({ statement: "The audience shows strong affinity (0.91) for Arijit Singh.", evidenceIds: ["ev-1"] }, evidence).support).toBe("verified");
    // 0.91 and 91% are the same value.
    expect(checkStatement({ statement: "Arijit Singh scores 91% affinity with this audience signal.", evidenceIds: ["ev-1"] }, evidence).support).toBe("verified");
    expect(checkStatement({ statement: "In Mumbai, 62% of Gen Z skincare buyers follow K-beauty creators.", evidenceIds: ["ev-2"] }, evidence).support).toBe("verified");
  });

  it("marks a statement weak when its cited evidence doesn't say it", () => {
    // Real id, wrong number: the model cited something that exists but doesn't support the figure.
    expect(checkStatement({ statement: "In Mumbai, 80% of Gen Z skincare buyers follow K-beauty creators.", evidenceIds: ["ev-2"] }, evidence).support).toBe("weak");
    // Real id, a name the source never mentions.
    expect(checkStatement({ statement: "Gen Z buyers are rejecting the clean-girl aesthetic popularised by Hailey Bieber.", evidenceIds: ["ev-2"] }, evidence).support).toBe("weak");
    // Real id about something else entirely.
    expect(checkStatement({ statement: "Lo-fi study playlists dominate saved music for college students.", evidenceIds: ["ev-1"] }, evidence).support).toBe("weak");
  });

  it("treats unknown or missing ids as uncited interpretation", () => {
    const r = checkStatement({ statement: "The brand could own late-night study rituals.", evidenceIds: ["made-up-id"] }, evidence);
    expect(r).toEqual({ statement: "The brand could own late-night study rituals.", evidenceIds: [], support: "uncited" });
    expect(checkStatement({ statement: "An interpretation.", evidenceIds: [] }, evidence).support).toBe("uncited");
  });

  it("scores and collects ids", () => {
    const list = checkStatements([
      { statement: "Arijit Singh has affinity 0.91.", evidenceIds: ["ev-1"] },
      { statement: "80% of Mumbai Gen Z follow K-beauty creators.", evidenceIds: ["ev-2", "ev-2"] },
      { statement: "", evidenceIds: ["ev-3"] },
      { statement: "A guess.", evidenceIds: [] },
    ], evidence);
    expect(list).toHaveLength(3);
    expect(groundingScore(list)).toEqual({ verified: 1, total: 3 });
    expect(citedIds(list)).toEqual(["ev-1", "ev-2"]);
    expect(groundingScore([])).toBeNull();
  });
});

describe("template drafts", () => {
  it("only make claims their evidence verifies (they quote it)", () => {
    const brief: BriefInput = { name: "Lumen launch", brand: "Lumen", product: null, category: "Skincare", market: "India", audience: "Gen Z", objective: null, existingPositioning: null, competitors: [], brandGuidelines: null, budgetRange: null, timeframe: null, additionalContext: null };
    const obs: Observation[] = [
      { id: "a", claim: "Qloo returned Arijit Singh (artist) with affinity 0.91.", entityName: "Arijit Singh", entityType: "artist", affinity: 0.91, role: "result" },
      { id: "b", claim: "Qloo returned Prateek Kuhad (artist) with affinity 0.84.", entityName: "Prateek Kuhad", entityType: "artist", affinity: 0.84, role: "result" },
      { id: "c", claim: "Qloo returned Nykaa (brand) with affinity 0.77.", entityName: "Nykaa", entityType: "brand", affinity: 0.77, role: "result" },
    ];
    const ev = new Map(obs.map((o) => [o.id, `${o.entityName} — ${o.claim}`]));
    const claims = templateStrategy(brief, obs, []).directions.flatMap((d) => checkStatements(d.claims, ev));
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.support === "verified")).toBe(true);
  });
});
