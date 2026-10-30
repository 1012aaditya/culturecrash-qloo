import { z } from "zod";

/** Card kinds on an inspiration board. Each is a React Flow node type. */
export const BOARD_NODE_TYPES = ["image", "note", "link", "entity", "group"] as const;
export type BoardNodeType = (typeof BOARD_NODE_TYPES)[number];

export type ImageData = { path: string | null; url?: string; title: string; sourceUrl: string | null; palette: string[] };
export type NoteData = { text: string; tone: "paper" | "lilac" | "peach" };
export type LinkData = { url: string; title: string; note: string };
export type EntityData = {
  entityId: string; name: string; type: string; role: string; affinity: number | null; imageUrl: string | null; evidenceId: string | null;
};
export type GroupData = { label: string };

export const MAX_NODES = 400;

/** Only http(s) links are kept, so a card can never carry a javascript: or data: URL. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const finite = z.number().finite();
const str = (max: number) => z.string().max(max).catch("");
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

const nodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(BOARD_NODE_TYPES),
  position: z.object({ x: finite, y: finite }),
  width: finite.positive().max(4000).optional(),
  height: finite.positive().max(4000).optional(),
  parentId: z.string().max(80).optional(),
  zIndex: finite.optional(),
  data: z.record(z.string(), z.unknown()),
});

export type StoredNode = z.infer<typeof nodeSchema>;

/** Cleans one node's data for its type: drops unknown fields, unsafe links and foreign storage paths. */
function cleanData(type: BoardNodeType, d: Record<string, unknown>, mediaPrefix: string): Record<string, unknown> {
  switch (type) {
    case "image": {
      const path = typeof d.path === "string" && d.path.startsWith(mediaPrefix) && !d.path.includes("..") ? d.path : null;
      const palette = z.array(hex).max(6).catch([]).parse(d.palette);
      return { path, title: str(200).parse(d.title ?? ""), sourceUrl: safeUrl(d.sourceUrl), palette } satisfies Omit<ImageData, "url">;
    }
    case "note":
      return { text: str(4000).parse(d.text ?? ""), tone: z.enum(["paper", "lilac", "peach"]).catch("paper").parse(d.tone) } satisfies NoteData;
    case "link":
      return { url: safeUrl(d.url) ?? "", title: str(200).parse(d.title ?? ""), note: str(1000).parse(d.note ?? "") } satisfies LinkData;
    case "entity":
      return {
        entityId: str(80).parse(d.entityId ?? ""), name: str(200).parse(d.name ?? ""), type: str(40).parse(d.type ?? ""), role: str(20).parse(d.role ?? ""),
        affinity: typeof d.affinity === "number" && Number.isFinite(d.affinity) ? d.affinity : null,
        imageUrl: d.imageUrl && String(d.imageUrl).startsWith("https://") ? safeUrl(d.imageUrl) : null,
        evidenceId: typeof d.evidenceId === "string" ? d.evidenceId.slice(0, 80) : null,
      } satisfies EntityData;
    case "group":
      return { label: str(120).parse(d.label ?? "") } satisfies GroupData;
  }
}

/**
 * Validates a board document before it is saved. Groups come first so React Flow sees
 * every parent before its children, and children of a missing group are detached.
 */
export function parseBoardContent(raw: unknown, mediaPrefix: string) {
  const parsed = z.object({
    nodes: z.array(nodeSchema).max(MAX_NODES),
    viewport: z.object({ x: finite, y: finite, zoom: finite.positive().max(8) }).nullable().optional(),
  }).safeParse(raw);
  if (!parsed.success) return null;
  const ids = new Set(parsed.data.nodes.filter((n) => n.type === "group").map((n) => n.id));
  const nodes = parsed.data.nodes
    .map((n) => ({ ...n, parentId: n.parentId && ids.has(n.parentId) ? n.parentId : undefined, data: cleanData(n.type, n.data, mediaPrefix) }))
    .sort((a, b) => Number(b.type === "group") - Number(a.type === "group"));
  return { nodes, viewport: parsed.data.viewport ?? null };
}

/** The board palette: the most common colours across its image cards, max 8. */
export function boardPalette(nodes: { type?: string; data: Record<string, unknown> }[]): string[] {
  const count = new Map<string, number>();
  for (const n of nodes) {
    if (n.type !== "image" || !Array.isArray(n.data.palette)) continue;
    for (const c of n.data.palette) if (typeof c === "string") count.set(c.toLowerCase(), (count.get(c.toLowerCase()) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
}
