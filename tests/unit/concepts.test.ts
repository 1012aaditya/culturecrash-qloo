import { describe, expect, it } from "vitest";
import { basePrompt, directionFacts, provenanceFor } from "@/lib/concepts/context";
import { pendingFrom } from "@/lib/concepts/data";
import { parseBoardContent } from "@/lib/boards/schema";

const ctx = { brief: { brand: "SKinC", category: "skincare", audience: "Gen Z in Indian metros" }, signals: [{ name: "Punjabi pop", affinity: 0.92 }, { name: "indie playback", affinity: 0.8 }] };
const dir = directionFacts({ id: "d1", slot: 2, name: "Sound of skin", evidence_ids: ["e1"], content: { coreIdea: "Skincare as a music ritual", culturalConnections: ["headphones", "night bus"], creativeImplications: "Warm, close" } });

describe("concept context", () => {
  it("builds a prompt from the brief, the direction's connections and the palette, with the safety rules", () => {
    const p = basePrompt(ctx, dir, ["violet"]);
    expect(p).toContain("for SKinC, a skincare brand");
    expect(p).toContain("Concept: Skincare as a music ritual.");
    expect(p).toContain("Cultural cues: headphones, night bus.");
    expect(p).toContain("no recognisable people");
    // Without a direction the audience's taste signals become the cues.
    expect(basePrompt(ctx, null, [])).toContain("Cultural cues: Punjabi pop, indie playback.");
  });

  it("records the trail and turns it back into card placement", () => {
    const prov = provenanceFor(ctx, dir, [], "prompt", { title: "Night bus ritual", placement: { group: "g1" }, improvement: { fromLevel: "partial", fromRationale: "", diagnosis: "", changes: [] } });
    expect(prov.direction).toEqual({ id: "d1", slot: 2, name: "Sound of skin", coreIdea: "Skincare as a music ritual" });
    expect(prov.signals[0]).toEqual({ name: "Punjabi pop", affinity: 0.92 });
    expect(pendingFrom("j1", "w1-concept", prov)).toEqual({ id: "j1", kind: "concept", title: "Night bus ritual", group: "g1", improvedFrom: "partial" });
    expect(pendingFrom("j2", "w3-variation", null)).toEqual({ id: "j2", kind: "variation" });
  });

  it("keeps a card's concept job id and improved-from level, and drops bad values", () => {
    const img = (extra: Record<string, unknown>) => ({ id: "n1", type: "image", position: { x: 0, y: 0 }, width: 260, height: 300, data: { path: null, thumbPath: null, title: "", alt: "", sourceUrl: null, palette: [], ...extra } });
    const ok = parseBoardContent({ nodes: [img({ rights: "ai", conceptJobId: "0f8fad5b-d9cb-469f-a165-70867728950e", improvedFrom: "partial" })], viewport: null }, "ws/p/b/");
    expect(ok?.nodes[0].data).toMatchObject({ rights: "ai", conceptJobId: "0f8fad5b-d9cb-469f-a165-70867728950e", improvedFrom: "partial" });
    const bad = parseBoardContent({ nodes: [img({ conceptJobId: "'; drop", improvedFrom: "great" })], viewport: null }, "ws/p/b/");
    expect(bad?.nodes[0].data).not.toHaveProperty("conceptJobId");
    expect(bad?.nodes[0].data).not.toHaveProperty("improvedFrom");
  });
});
