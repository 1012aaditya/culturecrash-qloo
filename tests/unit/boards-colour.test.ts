import { describe, expect, it } from "vitest";
import { colourName, contrastLevel, contrastRatio, hexToRgb, readablePairs } from "@/lib/boards/colour";

describe("colour helpers", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    // CultureCrash violet on white: readable as large text only.
    expect(contrastRatio("#8064f5", "#ffffff")).toBeCloseTo(4.15, 1);
    expect(contrastLevel(4.15)).toBe("AA large");
    expect(contrastLevel(7.1)).toBe("AAA");
    expect(contrastLevel(2)).toBe("fail");
    expect(hexToRgb("nope")).toBeNull();
  });

  it("names colours from a brand-friendly vocabulary", () => {
    expect(colourName("#8464f4")).toBe("Violet");
    expect(colourName("#f49c8c")).toBe("Coral");
    expect(colourName("#14141c")).toBe("Ink black");
    expect(colourName("#c9a27e")).toBe("Camel");
  });

  it("lists readable text/background pairs, best first", () => {
    const pairs = readablePairs(["#f7f5f2", "#8064f5"]);
    expect(pairs[0]).toMatchObject({ text: "#111116", background: "#f7f5f2", level: "AAA" });
    expect(pairs.every((p) => p.ratio >= 4.5)).toBe(true);
    expect(pairs.some((p) => p.text === "#ffffff" && p.background === "#8064f5")).toBe(false);
  });
});
