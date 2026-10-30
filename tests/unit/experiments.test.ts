import { describe, expect, it } from "vitest";
import { importResults, parseCsv } from "@/lib/experiments/csv";
import { compareArms, normalCdf } from "@/lib/experiments/stats";
import { SCAFFOLD_PREFIX, templateStrategy } from "@/lib/ai/template";

describe("compareArms", () => {
  it("matches a textbook two-proportion z-test", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    // 10% vs 13% on 1,000 each: z ≈ 2.10, p ≈ 0.036.
    const c = compareArms({ label: "Control", successes: 100, exposures: 1000 }, { label: "Ritual", successes: 130, exposures: 1000 });
    expect(c.verdict).toBe("variant_better");
    expect(c.pValue).toBeGreaterThan(0.03);
    expect(c.pValue).toBeLessThan(0.04);
    expect(c.lift).toBeCloseTo(0.3, 5);
    expect(c.ci95[0]).toBeGreaterThan(0); // the whole 95% range is above zero
  });

  it("doesn't call a small or noisy difference", () => {
    expect(compareArms({ label: "A", successes: 100, exposures: 1000 }, { label: "B", successes: 108, exposures: 1000 }).verdict).toBe("no_clear_difference");
    const tiny = compareArms({ label: "A", successes: 3, exposures: 40 }, { label: "B", successes: 9, exposures: 40 });
    expect(tiny.verdict).toBe("too_little_data");
    expect(tiny.reason).toMatch(/at least 100 exposures/);
  });

  it("calls a worse variant worse", () => {
    expect(compareArms({ label: "A", successes: 200, exposures: 2000 }, { label: "B", successes: 140, exposures: 2000 }).verdict).toBe("variant_worse");
  });
});

describe("CSV import", () => {
  const variants = [{ id: "v-control", label: "Control" }, { id: "v-ritual", label: "Ritual" }];

  it("reads a Meta Ads Manager export with quotes and thousands separators", () => {
    const csv = `"Ad set name","Reporting starts","Impressions","Results","Cost per result"
"Control – Feed","2026-10-01","12,400","310","1.20"
"Ritual – Stories","2026-10-01","11,950","402","0.95"
"Ritual – Reels","2026-10-01","3,050","88","1.10"
"Lookalike test","2026-10-01","900","12","2.00"`;
    const r = importResults(csv, variants);
    if ("error" in r) throw new Error(r.error);
    expect(r.rows).toEqual([
      { variant: "v-control", label: "Control", successes: 310, exposures: 12400 },
      { variant: "v-ritual", label: "Ritual", successes: 490, exposures: 15000 },
    ]);
    expect(r.unmatched).toEqual(["Lookalike test"]);
    expect(r.columns).toEqual({ name: "Ad set name", successes: "Results", exposures: "Impressions" });
  });

  it("reads Google Ads style columns, semicolon separators, and skips total rows", () => {
    const csv = "Campaign;Impr.;Conversions\nControl;5000;100\nRitual;5100;140\nTotal;10100;240\n";
    const r = importResults(csv, variants);
    if ("error" in r) throw new Error(r.error);
    expect(r.rows.map((x) => [x.label, x.successes, x.exposures])).toEqual([["Control", 100, 5000], ["Ritual", 140, 5100]]);
  });

  it("explains what's wrong instead of guessing", () => {
    expect(importResults("Name,Spend\nControl,100", variants)).toMatchObject({ error: expect.stringMatching(/Couldn't find the columns/) });
    expect(importResults("Variant,Conversions,Impressions\nControl,5000,100", variants)).toMatchObject({ error: expect.stringMatching(/swapped/) });
    expect(parseCsv('a,"b ""quoted"", c"\n1,2')).toEqual([["a", 'b "quoted", c'], ["1", "2"]]);
  });
});

describe("template strategy", () => {
  it("labels its drafts as scaffolds and gives each a different brand role", () => {
    const brief = { name: "Launch", brand: "Lumen", product: null, category: "Skincare", market: null, audience: null, objective: null, existingPositioning: "Gentle care", competitors: [], brandGuidelines: null, budgetRange: null, timeframe: null, additionalContext: null };
    const { directions } = templateStrategy(brief, [], []);
    expect(directions.every((d) => d.name.startsWith(SCAFFOLD_PREFIX))).toBe(true);
    expect(new Set(directions.map((d) => d.brandRole)).size).toBe(3);
    expect(directions[1].positioningStatement).not.toMatch(/sharper version of its existing promise/);
  });
});
