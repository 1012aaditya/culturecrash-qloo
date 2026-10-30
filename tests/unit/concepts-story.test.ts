import { describe, expect, it } from "vitest";
import { CHAPTERS, pickEntities, storyLayout, WORLD_FRAMES_Y, type StoryDirection } from "@/lib/concepts/story";
import { parseBoardContent, type EntityData } from "@/lib/boards/schema";

const ent = (name: string, type: string, affinity: number, img = true): EntityData =>
  ({ entityId: `e-${name}`, name, type, role: "result", affinity, imageUrl: img ? `https://img.example/${name}.jpg` : null, evidenceId: null });
const dir = (slot: number, over: Partial<StoryDirection> = {}): StoryDirection => ({
  slot, name: `Direction ${slot}`, coreIdea: "Skincare as a music ritual", positioning: "For Gen Z…", audienceContext: "Gen Z in metros", tension: "Routines feel clinical",
  brandRole: "Guide", pillars: ["Open", "Shared"], experiment: "A/B two playlists", entities: [ent(`A${slot}`, "artist", 0.9), ent(`P${slot}`, "place", 0.8)],
  evidence: [{ evidenceId: `ev${slot}`, claim: "Claim", evidenceType: "external_source", source: "reddit", url: "https://reddit.com/x", score: 0.7 }],
  links: [{ url: "https://news.example/a", title: "Story", siteName: "News", note: "" }],
  copy: { headline: "Play your skin", line: "A line", social: "A caption" }, why: ["Shows music."], ...over,
});

describe("story layout", () => {
  const { nodes, world } = storyLayout(3, [dir(1), dir(2), dir(3, { copy: null, evidence: [], links: [] })], (() => { let i = 0; return () => `n${++i}`; })());
  const groups = nodes.filter((n) => n.type === "group");

  it("builds five chapters per direction, in reading order", () => {
    expect(groups).toHaveLength(15);
    const order = [...groups].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x).map((g) => String(g.data.label));
    expect(order[0]).toBe("Direction 01 · 1 Who they are · Direction 1");
    expect(order.slice(1, 5).map((l) => l.replace(/^Direction 01 · \d /, ""))).toEqual(CHAPTERS.slice(1));
    expect(order[5]).toMatch(/^Direction 02 · 1/);
    expect(world.get(2)).toBe(groups.find((g) => g.data.label === "Direction 02 · 4 The world")?.id);
  });

  it("keeps every card inside its chapter, with no overlaps, and leaves room for frames in the world", () => {
    for (const g of groups) {
      const kids = nodes.filter((n) => n.parentId === g.id);
      for (const k of kids) {
        expect(k.position.x + k.width).toBeLessThanOrEqual(g.width);
        expect(k.position.y + k.height).toBeLessThanOrEqual(g.height);
      }
      for (const a of kids) for (const b of kids) {
        if (a === b) continue;
        const apart = a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x || a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y;
        expect(apart).toBe(true);
      }
    }
    const worldNote = nodes.find((n) => n.parentId === world.get(1));
    expect(worldNote!.position.y + worldNote!.height).toBeLessThan(WORLD_FRAMES_Y);
  });

  it("fills chapters from research and survives the board parser", () => {
    expect(nodes.filter((n) => n.type === "entity")).toHaveLength(6);
    expect(nodes.filter((n) => n.type === "evidence")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "link")).toHaveLength(2);
    expect(nodes.some((n) => n.type === "note" && String(n.data.text) === "Headline: Play your skin")).toBe(true);
    expect(parseBoardContent({ nodes, viewport: null }, "ws/p/b/")?.nodes).toHaveLength(nodes.length);
  });
});

describe("pickEntities", () => {
  const all = [ent("Arijit Singh", "artist", 0.99), ent("Shankar", "artist", 0.98), ent("Badshah", "artist", 0.97), ent("Goa", "place", 0.5), ent("Ted Lasso", "tv_show", 0.4, false), ent("glow", "tag", 1)];

  it("prefers what the direction mentions, mixes types, skips tags and entities used elsewhere", () => {
    const used = new Set<string>();
    const first = pickEntities(all, ["Ted Lasso fandom"], used, 3);
    expect(first.map((e) => e.name)).toEqual(["Ted Lasso", "Arijit Singh", "Shankar"]);
    const second = pickEntities(all, [], used, 3);
    expect(second.map((e) => e.name)).toEqual(["Badshah", "Goa"]);
  });
});
