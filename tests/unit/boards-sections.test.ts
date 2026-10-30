import { describe, expect, it } from "vitest";
import { namedIn, researchBoardLayout } from "@/lib/boards/layout";
import { parseBoardContent, type EntityData, type EvidenceCardData } from "@/lib/boards/schema";
import { boardHealth, boardSections, healthScore, type DirectionBrief, type SectionNode } from "@/lib/boards/sections";

let n = 0;
const card = (type: string, data: Record<string, unknown> = {}, at: [number, number] = [0, n * 10]): SectionNode => ({ id: `c${++n}`, type, position: { x: at[0], y: at[1] }, data });
const image = (data: Record<string, unknown> = {}) => card("image", { path: "p", palette: ["#112233", "#445566", "#778899"], sourceUrl: "https://a.test/x", rights: "licensed", ...data });
const entity = (name: string, type: string, affinity: number) => card("entity", { name, type, affinity, entityId: name });
const direction: DirectionBrief = {
  id: "d1", name: "Skin in Tune", slot: 2, coreIdea: "Skincare that sounds like your playlist", positioning: "", audience: "", brandRole: "",
  culturalConnections: ["Velvet Hours", "lo-fi beats"], messagingPillars: [], creativeImplications: "", evidenceIds: ["ev-2"],
};

describe("board sections", () => {
  it("sorts cards into the sections a client reads, keeping reading order and affinity order", () => {
    const later = image({ title: "second" });
    later.position = { x: 0, y: 500 };
    const first = image({ title: "first" });
    first.position = { x: 0, y: 0 };
    const s = boardSections([
      later, first,
      entity("Low", "artist", 0.2), entity("High", "artist", 0.9), entity("Paris", "place", 0.5), entity("Mystery", "unknown", 0.5),
      card("note", { text: "warm", role: "do" }), card("note", { text: "no labs", role: "dont" }), card("note", { text: "call Sam" }),
      card("evidence", { claim: "62%" }), card("link", { url: "https://x.test" }), card("group", { label: "G" }),
    ]);
    expect(s.images.map((i) => i.data.title)).toEqual(["first", "second"]);
    expect(s.culture.map((c) => [c.label, c.nodes.map((e) => e.data.name)])).toEqual([["Music", ["High", "Low"]], ["Places", ["Paris"]], ["Other", ["Mystery"]]]);
    expect([s.dos.length, s.donts.length, s.notes.length, s.proof.length, s.links.length]).toEqual([1, 1, 1, 1, 1]);
    expect(s.palette).toEqual(["#112233", "#445566", "#778899"]);
  });
});

describe("board health", () => {
  const ready = () => [
    ...Array.from({ length: 6 }, () => image()), entity("A", "artist", 0.9), entity("B", "artist", 0.8), entity("C", "place", 0.7),
    card("evidence", { claim: "x" }), card("evidence", { claim: "y" }), card("note", { text: "do", role: "do" }), card("note", { text: "dont", role: "dont" }),
  ];
  it("passes every check for a finished board", () => {
    const checks = boardHealth(ready(), direction);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(healthScore(checks)).toEqual({ passed: 9, total: 9 });
  });
  it("says what is missing and points at the images concerned", () => {
    const loose = image({ sourceUrl: null, rights: "reference" });
    const off = image({ fit: { level: "off", tags: [], descriptors: [], rationale: "", model: "m", at: "t" } });
    const checks = boardHealth([loose, off, card("note", { text: "only a do", role: "do" }), card("note", { text: "  ", role: "dont" })], null);
    const failed = Object.fromEntries(checks.filter((c) => !c.ok).map((c) => [c.key, c]));
    expect(Object.keys(failed).sort()).toEqual(["culture", "direction", "fit", "guardrails", "images", "proof", "rights", "sources"]);
    expect(failed.images.label).toBe("2 of 6 images");
    expect(failed.guardrails.label).toBe("No don’ts yet");
    expect(failed.sources.ids).toEqual([loose.id]);
    expect(failed.rights.ids).toEqual([loose.id]);
    expect(failed.fit.ids).toEqual([off.id]);
  });
  it("doesn't ask for a source on the client's own assets", () => {
    const own = image({ sourceUrl: null, rights: "own" });
    expect(boardHealth([own], direction).find((c) => c.key === "sources")?.ok).toBe(true);
  });
});

describe("building a board for a direction", () => {
  const e = (name: string, affinity: number): EntityData => ({ entityId: name, name, type: "artist", role: "result", affinity, imageUrl: null, evidenceId: null });
  const ev = (id: string): EvidenceCardData => ({ evidenceId: id, claim: id, evidenceType: "external_source", source: "web", url: null, score: 0.5 });
  it("matches cultural connections loosely", () => {
    expect(namedIn("Velvet Hours", ["the music of Velvet Hours"])).toBe(true);
    expect(namedIn("Velvet Hours", ["Velvet hours"])).toBe(true);
    expect(namedIn("A", ["Abba"])).toBe(false);
  });
  it("puts what the direction names first, then the strongest affinities", () => {
    const nodes = researchBoardLayout([e("Top", 0.99), e("Velvet Hours", 0.1), ...Array.from({ length: 6 }, (_, i) => e(`X${i}`, 0.5))], [ev("ev-1"), ev("ev-2")],
      { runLabel: "r", direction, id: (() => { let i = 0; return () => `n${++i}`; })() });
    const music = nodes.filter((x) => x.type === "entity").map((x) => x.data.name);
    expect(music.slice(0, 2)).toEqual(["Velvet Hours", "Top"]);
    expect(nodes.filter((x) => x.type === "evidence").map((x) => x.data.evidenceId)).toEqual(["ev-2", "ev-1"]);
    expect(String(nodes[0].data.text)).toContain("for “Skin in Tune”");
  });
});

describe("note roles", () => {
  it("keeps do and don't roles and drops anything else", () => {
    const parsed = parseBoardContent({ nodes: [
      { id: "a", type: "note", position: { x: 0, y: 0 }, data: { text: "x", role: "do" } },
      { id: "b", type: "note", position: { x: 0, y: 0 }, data: { text: "y", role: "dont" } },
      { id: "c", type: "note", position: { x: 0, y: 0 }, data: { text: "z", role: "<script>" } },
    ] }, "ws/p/b/");
    expect(parsed?.nodes.map((x) => x.data.role)).toEqual(["do", "dont", undefined]);
  });
});
