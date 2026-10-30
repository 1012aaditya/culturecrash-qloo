import { describe, expect, it } from "vitest";
import { stripEvidenceIds } from "@/lib/ai";

describe("stripEvidenceIds", () => {
  it("removes ids the model wrote into client-facing prose (live creative brief text)", () => {
    const live =
      "These are Shankar Mahadevan at 0.978 (f5e49479-6da5-413d-a4a6-11994954e5b1), Sukhwinder Singh at 0.976 (1a090c14-d0ca-4f66-8fb2-f0d8bc5a1d3e). " +
      "Indian music artists show the strongest signals (f5e49479-6da5-413d-a4a6-11994954e5b1, 1a090c14-d0ca-4f66-8fb2-f0d8bc5a1d3e, 855addbe-6afe-461a-8f16-73a23cc4274b).";
    expect(stripEvidenceIds(live)).toBe("These are Shankar Mahadevan at 0.978, Sukhwinder Singh at 0.976. Indian music artists show the strongest signals.");
  });

  it("removes bracketed and bare ids and leaves other parentheses alone", () => {
    expect(stripEvidenceIds("Boutique [ids: 60d28321-f438-42ce-becd-108564483abc] leads.")).toBe("Boutique leads.");
    expect(stripEvidenceIds("See 60d28321-f438-42ce-becd-108564483abc for detail.")).toBe("See for detail.");
    expect(stripEvidenceIds("Ages 18–30 (metro India) only.")).toBe("Ages 18–30 (metro India) only.");
  });
});
