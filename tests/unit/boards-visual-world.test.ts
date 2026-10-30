import { describe, expect, it } from "vitest";
import { visualWorld } from "@/lib/boards/visual-world";

const image = (i: number, extra: Record<string, unknown> = {}) =>
  ({ type: "image", data: { path: `ws/p/b/${i}.webp`, thumbPath: `ws/p/b/${i}.thumb.webp`, title: `Image ${i}`, alt: "", sourceUrl: null, palette: ["#8064f5"], ...extra } });

describe("visualWorld", () => {
  it("keeps up to nine images with rights, safe sources and a named palette", () => {
    const v = visualWorld("Board", [
      image(1, { rights: "own", sourceUrl: "https://example.com/a" }),
      image(2, { rights: "bogus", sourceUrl: "javascript:alert(1)" }),
      ...Array.from({ length: 10 }, (_, i) => image(i + 3)),
      { type: "group", data: { label: "G" } },
    ]);
    expect(v.images).toHaveLength(9);
    expect(v.images[0]).toMatchObject({ rights: "own", sourceUrl: "https://example.com/a" });
    expect(v.images[1]).toMatchObject({ rights: "reference", sourceUrl: null });
    expect(v.palette).toEqual([{ hex: "#8064f5", name: "Violet" }]);
    expect(v.cardCount).toBe(12);
  });

  it("carries board notes and source coverage, and skips images without a stored file", () => {
    const v = visualWorld("Board", [
      { type: "note", data: { text: "  Critique: lean into texture  " } },
      { type: "note", data: { text: "" } },
      { type: "image", data: { path: null, title: "Uploading" } },
      { type: "link", data: { url: "https://example.com" } },
    ]);
    expect(v.notes).toEqual(["Critique: lean into texture"]);
    expect(v.images).toEqual([]);
    expect(v.coverage.sourceable).toBeGreaterThan(0);
  });
});
