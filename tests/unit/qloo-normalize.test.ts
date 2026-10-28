import { describe, expect, it } from "vitest";
import { extractList, normalizeEntity, normalizeTag, parseExplainability, shortType } from "@/lib/providers/qloo/normalize";

describe("Qloo response normalisation", () => {
  it("normalises an insights entity, keeping only supported fields", () => {
    const e = normalizeEntity({
      entity_id: "ABC-123", name: " Bon Iver ", subtype: "urn:entity:artist", popularity: 0.91,
      properties: { short_description: "Indie folk band" }, tags: [{ name: "indie", tag_id: "t1" }, "folk"],
      query: { affinity: 0.87, explainability: { "signal.interests.entities": [{ entity_id: "SEED-1", score: 0.52 }] } },
    });
    expect(e).toMatchObject({ providerId: "ABC-123", name: "Bon Iver", type: "artist", affinity: 0.87, popularity: 0.91, tags: ["indie", "folk"], description: "Indie folk band" });
    expect(e?.explainability).toEqual([{ entityId: "SEED-1", score: 0.52 }]);
  });

  it("rejects entities without an identifier or name instead of inventing them", () => {
    expect(normalizeEntity({ name: "No id" })).toBeNull();
    expect(normalizeEntity({ entity_id: "x" })).toBeNull();
    expect(normalizeEntity(null)).toBeNull();
  });

  it("leaves affinity null when the provider does not return one", () => {
    expect(normalizeEntity({ id: "1", name: "X", type: "urn:entity:brand" })?.affinity).toBeNull();
  });

  it("extracts lists from results.entities, a bare results array, and reports missing results", () => {
    expect(extractList({ results: { entities: [1, 2] } }, "entities")).toEqual([1, 2]);
    expect(extractList({ results: [3] }, "entities")).toEqual([3]);
    expect(extractList({ results: {} }, "entities")).toEqual([]);
    expect(extractList({ nope: true }, "entities")).toBeNull();
  });

  it("parses explainability in list and keyed forms", () => {
    expect(parseExplainability([{ id: "a", weight: 0.3 }])).toEqual([{ entityId: "a", score: 0.3 }]);
    expect(parseExplainability({ x: [{ entity_id: "b", score: 0.4 }] })).toEqual([{ entityId: "b", score: 0.4 }]);
    expect(parseExplainability("garbage")).toEqual([]);
  });

  it("normalises tags and types", () => {
    expect(normalizeTag({ tag_id: "urn:tag:keyword:qloo:indie", name: " indie", query: { affinity: 0.5 } })).toMatchObject({ name: "indie", affinity: 0.5 });
    expect(shortType("urn:entity:tv_show")).toBe("tv_show");
    expect(shortType(undefined)).toBe("entity");
  });
});
