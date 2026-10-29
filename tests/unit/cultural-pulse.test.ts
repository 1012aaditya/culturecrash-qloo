import { describe, expect, it } from "vitest";
import { templateCulturalPulse, liveCulturalPulseSchema } from "@/lib/research/cultural-pulse";
import type { BriefInput } from "@/lib/ai/template";

function mockBrief(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    name: "Aether Headphones",
    brand: "Aether",
    product: "Wireless ANC Headphones",
    category: "Consumer Tech & Audio",
    market: "London",
    audience: "Gen Z audiophiles and creatives",
    objective: "Launch brand in Europe",
    existingPositioning: null,
    competitors: ["Sony", "Bose", "Apple"],
    interests: ["Electronic Music", "Industrial Design"],
    brandGuidelines: null,
    budgetRange: null,
    timeframe: null,
    additionalContext: null,
    ...overrides,
  };
}

describe("Live Cultural Pulse & Zeitgeist", () => {
  it("produces schema-valid cultural pulse template", () => {
    const brief = mockBrief();
    const pulse = templateCulturalPulse(brief, "18-24");

    const validated = liveCulturalPulseSchema.safeParse(pulse);
    expect(validated.success).toBe(true);
    expect(pulse.zeitgeistSummary).toContain("2026");
    expect(pulse.microAesthetics.length).toBeGreaterThanOrEqual(2);
    expect(pulse.culturalTensions.length).toBeGreaterThanOrEqual(2);
    expect(pulse.watchouts.length).toBeGreaterThanOrEqual(1);
  });

  it("customizes zeitgeist and relevance to the targeted age cohort", () => {
    const brief = mockBrief();
    const pulse = templateCulturalPulse(brief, "18-24");
    expect(pulse.microAesthetics[0].audienceRelevance).toContain("age 18-24");
  });
});
