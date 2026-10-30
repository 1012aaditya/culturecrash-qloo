import { describe, expect, it } from "vitest";
import { researchBoardLayout } from "@/lib/boards/layout";
import { parseBoardContent } from "@/lib/boards/schema";
import type { EntityData, EvidenceCardData } from "@/lib/boards/schema";

const entity = (name: string, type: string, affinity: number | null): EntityData =>
  ({ entityId: `e-${name}`, name, type, role: "affinity", affinity, imageUrl: null, evidenceId: null });
const claim = (n: number): EvidenceCardData =>
  ({ evidenceId: `ev-${n}`, claim: `Claim ${n}`, evidenceType: "external_source", source: "serper", url: null, score: 0.5 });

const counter = () => { let i = 0; return () => `n${++i}`; };

describe("researchBoardLayout", () => {
  it("groups entities by theme, strongest affinity first, at most six per theme", () => {
    const artists = Array.from({ length: 8 }, (_, i) => entity(`A${i}`, "artist", i / 10));
    const nodes = researchBoardLayout([...artists, entity("Paris", "place", 0.9)], [], { runLabel: "run 1", id: counter() });
    const groups = nodes.filter((n) => n.type === "group");
    expect(groups.map((g) => g.data.label)).toEqual(["Music", "Places"]);
    const music = nodes.filter((n) => n.parentId === groups[0].id);
    expect(music).toHaveLength(6);
    expect(music[0].data.name).toBe("A7");
    expect(nodes[0]).toMatchObject({ type: "note" });
    expect(String(nodes[0].data.text)).toContain("run 1");
  });

  it("adds an evidence group of up to six claims and skips unknown entity types", () => {
    const nodes = researchBoardLayout([entity("X", "unknown_type", 1)], Array.from({ length: 9 }, (_, i) => claim(i)), { runLabel: "r", id: counter() });
    const groups = nodes.filter((n) => n.type === "group");
    expect(groups.map((g) => g.data.label)).toEqual(["Evidence"]);
    expect(nodes.filter((n) => n.type === "evidence")).toHaveLength(6);
    expect(nodes.some((n) => n.type === "entity")).toBe(false);
  });

  it("lays groups out without overlap and survives the board parser", () => {
    const types = ["artist", "movie", "place", "brand", "person"];
    const nodes = researchBoardLayout(types.map((t, i) => entity(`E${i}`, t, 0.5)), [claim(1)], { runLabel: "r", id: counter() });
    const groups = nodes.filter((n) => n.type === "group");
    for (const a of groups) for (const b of groups) {
      if (a === b) continue;
      const apart = a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x
        || a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y;
      expect(apart).toBe(true);
    }
    const parsed = parseBoardContent({ nodes, viewport: null }, "ws/p/b/");
    expect(parsed?.nodes).toHaveLength(nodes.length);
  });
});
