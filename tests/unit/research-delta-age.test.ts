import { describe, expect, it } from "vitest";
import { extractAgeCohort, buildPlan } from "@/lib/research/engine";
import type { BriefInput } from "@/lib/ai/template";

describe("extractAgeCohort", () => {
  it("extracts 18-24 cohort for Gen Z and young adults", () => {
    expect(extractAgeCohort("Targeting Gen Z creators in urban centers")).toBe("18-24");
    expect(extractAgeCohort("Audience: 18-24 college students")).toBe("18-24");
    expect(extractAgeCohort("Young adult trendsetters")).toBe("18-24");
  });

  it("extracts 25-34 cohort for Millennials", () => {
    expect(extractAgeCohort("Millennials living in metropolitan hubs")).toBe("25-34");
    expect(extractAgeCohort("Young professionals 25-34")).toBe("25-34");
  });

  it("extracts 35-44 cohort", () => {
    expect(extractAgeCohort("Ages 35-44 with disposable income")).toBe("35-44");
    expect(extractAgeCohort("Older millennials (35-44)")).toBe("35-44");
  });

  it("extracts 45-54 and 55+ cohorts", () => {
    expect(extractAgeCohort("Gen X leaders (45-54)")).toBe("45-54");
    expect(extractAgeCohort("Seniors and boomers (55+)")).toBe("55+");
  });

  it("returns undefined for text without age indicators or empty input", () => {
    expect(extractAgeCohort(null)).toBeUndefined();
    expect(extractAgeCohort(undefined)).toBeUndefined();
    expect(extractAgeCohort("General luxury coffee lovers worldwide")).toBeUndefined();
  });
});

function mockBrief(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    name: "Sample Brief",
    brand: "TestBrand",
    product: null,
    category: "Beverage",
    market: "London",
    audience: null,
    objective: null,
    existingPositioning: null,
    competitors: [],
    interests: [],
    brandGuidelines: null,
    budgetRange: null,
    timeframe: null,
    additionalContext: null,
    ...overrides,
  };
}

describe("buildPlan with Age-Cohort Slicing", () => {
  it("incorporates ageCohort into plan notes and question when found in audience", () => {
    const plan = buildPlan(
      mockBrief({
        name: "Oat Milk Campaign",
        brand: "Oatly",
        competitors: ["Alpro"],
        audience: "Gen Z college students",
        interests: ["Coffee", "Indie Music"],
      })
    );

    expect(plan.ageCohort).toBe("18-24");
    expect(plan.question).toContain("(age 18-24)");
    expect(plan.notes.some((n) => n.includes("age cohort 18-24"))).toBe(true);
  });

  it("defaults ageCohort to null when not present", () => {
    const plan = buildPlan(
      mockBrief({
        name: "Tech Launch",
        brand: "Acme",
        audience: "Developers and designers",
        interests: ["Coding"],
      })
    );

    expect(plan.ageCohort).toBeNull();
    expect(plan.question).not.toContain("(age ");
  });
});
