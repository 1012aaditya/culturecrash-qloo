import { describe, expect, it } from "vitest";
import { pickMatchingEntity, pickMatchingTag } from "@/lib/research/engine";

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

describe("pickMatchingTag", () => {
  const tag = (name: string, type = "urn:tag:keyword:qloo") => ({ name, type });

  it("rejects loose /v2/tags matches seen live", () => {
    expect(pickMatchingTag("K-beauty", [tag("Kent Downs Area of Outstanding Natural Beauty"), tag("Beauty salon")])).toBeUndefined();
    expect(pickMatchingTag("clean beauty", [tag("Beauty salon"), tag("Health And Beauty Shop")])).toBeUndefined();
  });

  it("accepts tags containing every word, ignoring spacing and plurals", () => {
    expect(pickMatchingTag("skincare", [tag("Skincare"), tag("Skin care")])?.name).toBe("Skincare");
    expect(pickMatchingTag("skin care", [tag("Skincare")])?.name).toBe("Skincare");
    expect(pickMatchingTag("podcast", [tag("True crime podcasts")])?.name).toBe("True crime podcasts");
    expect(pickMatchingTag("K-beauty", [tag("K beauty")])?.name).toBe("K beauty");
  });

  it("prefers a taste tag over a genre tag among matches", () => {
    expect(pickMatchingTag("skincare", [tag("Skincare", "urn:tag:genre:brand"), tag("Skin care")])?.type).toBe("urn:tag:keyword:qloo");
    expect(pickMatchingTag("skincare", [tag("Skincare", "urn:tag:genre:brand")])?.type).toBe("urn:tag:genre:brand");
  });
});
