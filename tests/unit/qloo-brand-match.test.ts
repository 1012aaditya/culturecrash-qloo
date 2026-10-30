import { describe, expect, it } from "vitest";
import { pickMatchingEntity } from "@/lib/research/engine";

const names = (...xs: string[]) => xs.map((name) => ({ name }));

describe("pickMatchingEntity", () => {
  it("does not swap a new brand for a similarly named one", () => {
    // Live finding (2026-10-30): Qloo's top /search result for "SKinC" was SkinCeuticals.
    expect(pickMatchingEntity("SKinC", names("SkinCeuticals", "Skin1004"))).toBeUndefined();
    expect(pickMatchingEntity("Plum", names("Plum Organics"))).toBeUndefined();
  });

  it("matches ignoring case, accents, punctuation, spacing and & vs and", () => {
    expect(pickMatchingEntity("nykaa", names("Nykaa"))?.name).toBe("Nykaa");
    expect(pickMatchingEntity("Dot and Key", names("Dot & Key"))?.name).toBe("Dot & Key");
    expect(pickMatchingEntity("LOreal Paris", names("L'Oréal Paris"))?.name).toBe("L'Oréal Paris");
    expect(pickMatchingEntity("The DermaCo", names("The Derma Co"))?.name).toBe("The Derma Co");
  });

  it("uses the first matching result, not just the top one", () => {
    const hit = pickMatchingEntity("Minimalist", [{ name: "Minimalism Co", id: 1 }, { name: "Minimalist", id: 2 }]);
    expect(hit?.id).toBe(2);
  });

  it("returns nothing for empty queries or results", () => {
    expect(pickMatchingEntity("", names("Anything"))).toBeUndefined();
    expect(pickMatchingEntity("Nykaa", [])).toBeUndefined();
  });
});
