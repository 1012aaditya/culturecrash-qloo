import type { EntityData, EvidenceCardData } from "@/lib/boards/schema";

/**
 * The visual-futures canvas as a story: one row per strategy direction, read left to right in five
 * chapters (who, tension, idea, world, how it shows up). Presentation mode walks the chapters in this
 * order, so the board doubles as an animatic. Chapter six holds touchpoint mockups of the frames. Everything but the AI frames comes from stored research
 * and the direction itself; the frames land in the "world" chapter as the GPU PC finishes them.
 */

export type StoryCopy = { headline: string; line: string; social: string };
export type StoryLink = { url: string; title: string; siteName: string; note: string };
export type StoryDirection = {
  slot: number; name: string; coreIdea: string; positioning: string; audienceContext: string; tension: string; brandRole: string;
  pillars: string[]; experiment: string;
  entities: EntityData[]; evidence: EvidenceCardData[]; links: StoryLink[];
  copy: StoryCopy | null; why: string[];
};
type Node = { id: string; type: string; position: { x: number; y: number }; width: number; height: number; parentId?: string; zIndex?: number; data: Record<string, unknown> };

export const CHAPTERS = ["Who they are", "The tension", "The idea", "The world", "How it shows up", "Touchpoints"] as const;
const H = 700;
const ROW_GAP = 140;
const COL_GAP = 40;
const WIDTHS = [440, 620, 460, 720, 520, 880];
/** Where AI frames start inside the world chapter (below its art-direction note). */
export const WORLD_FRAMES_Y = 186;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function storyLayout(version: number, dirs: StoryDirection[], id: () => string = () => crypto.randomUUID()) {
  const nodes: Node[] = [{
    id: id(), type: "note", position: { x: 0, y: 0 }, width: 760, height: 130,
    data: { tone: "peach", text: `Visual futures · strategy v${version}. Each row tells one direction's story, left to right: who the audience is, the tension they feel, the idea, its world and how it shows up. Research cards come from Qloo and the cited evidence; AI frames are concepts for discussion, not final artwork. Press play to watch it as a story.` },
  }];
  const world = new Map<number, string>();
  const touch = new Map<number, string>();
  dirs.forEach((d, row) => {
    const y = 200 + row * (H + ROW_GAP);
    let x = 0;
    const groups = CHAPTERS.map((title, c) => {
      const g: Node = { id: id(), type: "group", position: { x, y }, width: WIDTHS[c], height: H, zIndex: -1, data: { label: clip(`Direction 0${d.slot} · ${c + 1} ${title}${c === 0 ? ` · ${d.name}` : ""}`, 120) } };
      x += WIDTHS[c] + COL_GAP;
      nodes.push(g);
      return g.id;
    });
    const put = (c: number, type: string, px: number, py: number, w: number, h: number, data: Record<string, unknown>) =>
      nodes.push({ id: id(), type, parentId: groups[c], position: { x: px, y: py }, width: w, height: h, data });
    const note = (c: number, px: number, py: number, w: number, h: number, text: string, tone: "paper" | "lilac" | "peach" = "paper") => text && put(c, "note", px, py, w, h, { text: clip(text, 1200), tone });

    // 1 · Who they are: the audience, and the people and things they love (Qloo).
    note(0, 20, 56, 400, 130, d.audienceContext || "Audience context not written yet.");
    d.entities.slice(0, 4).forEach((e, i) => put(0, "entity", 20 + (i % 2) * 200, 206 + Math.floor(i / 2) * 230, 180, 210, { ...e }));

    // 2 · The tension: what they feel, and the evidence and sources behind it.
    note(1, 20, 56, 580, 130, d.tension ? `The tension: ${d.tension}` : "No consumer tension is supported by evidence yet.", "peach");
    d.evidence.slice(0, 2).forEach((e, i) => put(1, "evidence", 20 + i * 300, 206, 280, 200, { ...e }));
    d.links.slice(0, 2).forEach((l, i) => put(1, "link", 20 + i * 300, 426, 280, 170, { url: l.url, title: l.title, note: l.note, siteName: l.siteName, imagePath: null }));

    // 3 · The idea.
    note(2, 20, 56, 420, 250, `${d.name}\n\n${d.coreIdea}`, "lilac");
    note(2, 20, 326, 420, 170, d.positioning ? `Positioning: ${d.positioning}` : "");
    note(2, 20, 516, 420, 120, d.brandRole ? `The brand's role: ${d.brandRole}` : "", "peach");

    // 4 · The world: the art director's intent; AI frames are placed below it as they arrive.
    note(3, 20, 56, 680, 110, d.why.length ? `Art direction: ${d.why.join(" ")}` : "Art direction: frames built from this direction's idea and the audience's taste signals.");
    world.set(d.slot, groups[3]);
    // 6 · Touchpoints: mockups of the frames with the copy, added as the frames arrive.
    touch.set(d.slot, groups[5]);

    // 5 · How it shows up: copy lines, pillars and the test that would prove it.
    if (d.copy) {
      note(4, 20, 56, 480, 120, `Headline: ${d.copy.headline}`, "lilac");
      note(4, 20, 196, 480, 110, `Line: ${d.copy.line}`);
      note(4, 20, 326, 480, 110, `Social: ${d.copy.social}`);
    }
    note(4, 20, d.copy ? 456 : 56, 480, 100, d.pillars.length ? `Messaging pillars: ${d.pillars.slice(0, 4).join(" · ")}` : "");
    note(4, 20, d.copy ? 576 : 176, 480, 104, d.experiment ? `Test it: ${d.experiment}` : "", "peach");
  });
  return { nodes, world, touch };
}

/** Where each mockup goes in the touchpoints chapter: a portrait hero makes the post and story, a wide frame the playlist and billboard. */
export const TOUCHPOINT_SLOTS = {
  post: { x: 20, y: 56, width: 280, height: 350 },
  story: { x: 320, y: 56, width: 200, height: 356 },
  playlist: { x: 540, y: 56, width: 300, height: 340 },
  billboard: { x: 20, y: 426, width: 480, height: 250 },
} as const;

/** The most vivid colour of a palette (highest saturation × mid lightness), for mockup accents. */
export function vividColour(palette: string[]): string | null {
  let best: string | null = null;
  let score = -1;
  for (const hex of palette) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => parseInt(v, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const sc = sat * (1 - Math.abs(l - 0.45) * 1.6);
    if (sc > score) { score = sc; best = hex.toLowerCase(); }
  }
  return best;
}

/**
 * Picks up to four Qloo entities per direction: ones its cultural connections mention first, then the
 * strongest remaining with a picture. Entities already used by another direction are skipped.
 */
export function pickEntities(all: EntityData[], connections: string[], used: Set<string>, n = 4): EntityData[] {
  const words = connections.join(" ").toLowerCase();
  const pool = all.filter((e) => e.type !== "tag" && !used.has(e.entityId));
  const mentioned = pool.filter((e) => words.includes(e.name.toLowerCase()) || words.includes(e.type.replace(/_/g, " ")));
  const rest = pool.filter((e) => !mentioned.includes(e)).sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || (b.affinity ?? 0) - (a.affinity ?? 0));
  // Mix types so a row doesn't read as four of the same thing: at most two per type, unless nothing else is left.
  const ranked = [...mentioned, ...rest];
  const out: EntityData[] = [];
  for (const e of ranked) if (out.length < n && out.filter((o) => o.type === e.type).length < 2) out.push(e);
  for (const e of ranked) if (out.length < n && !out.includes(e)) out.push(e);
  out.forEach((e) => used.add(e.entityId));
  return out;
}
