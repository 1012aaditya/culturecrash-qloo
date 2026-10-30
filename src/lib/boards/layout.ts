import type { EntityData, EvidenceCardData } from "./schema";

/** A deterministic starter board from research: no model call, so nothing on it is invented. */

type Node = { id: string; type: "group" | "entity" | "evidence" | "note"; position: { x: number; y: number }; width: number; height: number; parentId?: string; zIndex?: number; data: Record<string, unknown> };

export const THEMES: { label: string; types: string[] }[] = [
  { label: "Music", types: ["artist"] },
  { label: "Film & TV", types: ["movie", "tv_show"] },
  { label: "Places", types: ["place", "destination"] },
  { label: "Brands", types: ["brand"] },
  { label: "People", types: ["person"] },
  { label: "Podcasts", types: ["podcast"] },
  { label: "Books & games", types: ["book", "video_game"] },
  { label: "Taste tags", types: ["tag"] },
];

const PER_THEME = 6;
const CARD = { w: 180, h: 200 };
const EVIDENCE_CARD = { w: 280, h: 170 };
const GAP = 20;
const HEADER = 36;
const COLUMNS = 3;

const grid = (n: number, cols: number, w: number, h: number) => ({
  width: cols * w + (cols + 1) * GAP,
  height: HEADER + Math.ceil(n / cols) * (h + GAP) + GAP,
  at: (i: number) => ({ x: GAP + (i % cols) * (w + GAP), y: HEADER + GAP + Math.floor(i / cols) * (h + GAP) }),
});

/** Whether a Qloo entity is one of the cultural connections a direction names (names match loosely, either way round). */
export function namedIn(name: string, connections: string[]): boolean {
  const n = name.trim().toLowerCase();
  return n.length > 1 && connections.some((c) => {
    const x = c.toLowerCase();
    return x.includes(n) || (x.length > 3 && n.includes(x));
  });
}

export function researchBoardLayout(
  entities: EntityData[], evidence: EvidenceCardData[],
  opts: { runLabel: string; id?: () => string; direction?: { name: string; culturalConnections: string[]; evidenceIds: string[] } },
): Node[] {
  const id = opts.id ?? (() => crypto.randomUUID());
  const dir = opts.direction;
  // With a direction, what it names comes first: its cultural connections, then its cited evidence.
  const rank = (e: EntityData) => (dir && namedIn(e.name, dir.culturalConnections) ? 1 : 0);
  const nodes: Node[] = [];
  const blocks: { group: Node; children: Node[] }[] = [];

  for (const theme of THEMES) {
    const picks = entities
      .filter((e) => theme.types.includes(e.type))
      .sort((a, b) => rank(b) - rank(a) || (b.affinity ?? -1) - (a.affinity ?? -1))
      .slice(0, PER_THEME);
    if (!picks.length) continue;
    const g = grid(picks.length, COLUMNS, CARD.w, CARD.h);
    const group: Node = { id: id(), type: "group", position: { x: 0, y: 0 }, width: g.width, height: g.height, zIndex: -1, data: { label: theme.label } };
    blocks.push({ group, children: picks.map((e, i) => ({ id: id(), type: "entity", position: g.at(i), width: CARD.w, height: CARD.h, parentId: group.id, data: { ...e } })) });
  }

  const cited = new Set(dir?.evidenceIds ?? []);
  const claims = [...evidence].sort((a, b) => Number(cited.has(b.evidenceId)) - Number(cited.has(a.evidenceId))).slice(0, 6);
  if (claims.length) {
    const g = grid(claims.length, 2, EVIDENCE_CARD.w, EVIDENCE_CARD.h);
    const group: Node = { id: id(), type: "group", position: { x: 0, y: 0 }, width: g.width, height: g.height, zIndex: -1, data: { label: "Evidence" } };
    blocks.push({ group, children: claims.map((c, i) => ({ id: id(), type: "evidence", position: g.at(i), width: EVIDENCE_CARD.w, height: EVIDENCE_CARD.h, parentId: group.id, data: { ...c } })) });
  }

  // Blocks flow left to right in rows of three, each row as tall as its tallest block.
  const intro: Node = {
    id: id(), type: "note", position: { x: 0, y: 0 }, width: 420, height: 130,
    data: { tone: "peach", text: `Built from research (${opts.runLabel})${dir ? ` for “${dir.name}”: the references and evidence that direction names first, then` : ":"} the strongest Qloo affinities per theme${claims.length ? " and the best-supported evidence" : ""}. Affinity is a taste correlation, not purchase intent. Rearrange, remove and add your own references.` },
  };
  nodes.push(intro);
  let y = intro.height + 60;
  for (let r = 0; r < blocks.length; r += 3) {
    const row = blocks.slice(r, r + 3);
    let x = 0;
    for (const b of row) {
      b.group.position = { x, y };
      nodes.push(b.group, ...b.children);
      x += b.group.width + 60;
    }
    y += Math.max(...row.map((b) => b.group.height)) + 80;
  }
  return nodes;
}
