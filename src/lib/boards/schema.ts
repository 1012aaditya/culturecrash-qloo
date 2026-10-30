import { z } from "zod";

/** Card kinds on an inspiration board. Each is a React Flow node type. */
export const BOARD_NODE_TYPES = ["image", "note", "link", "entity", "group", "evidence"] as const;
export type BoardNodeType = (typeof BOARD_NODE_TYPES)[number];

/** Fields every card may carry. `locked` cards cannot be moved, resized or deleted until unlocked. */
export type CommonData = { locked?: boolean };
/** `url` / `thumbUrl` / `imageUrl`-style fields ending in Url are signed at load time and never stored. */
export type ImageData = CommonData & {
  path: string | null; thumbPath: string | null; url?: string; thumbUrl?: string;
  title: string; alt: string; sourceUrl: string | null; palette: string[];
  /** AI-assessed visual fit with the audience's Qloo taste tags (a hypothesis, not evidence). */
  fit?: ImageFitData;
  /** Usage rights: a found reference (default), a licensed image, or the client's or agency's own asset. */
  rights?: ImageRights;
};
export const IMAGE_RIGHTS = ["reference", "licensed", "own"] as const;
export type ImageRights = (typeof IMAGE_RIGHTS)[number];
export type ImageFitData = { level: "strong" | "partial" | "off" | "unknown"; tags: string[]; descriptors: string[]; rationale: string; model: string; at: string };
/** A stored evidence item (cited web claim, conclusion or result) placed on a board; the ledger stays the source of truth. */
export type EvidenceCardData = CommonData & { evidenceId: string; claim: string; evidenceType: string; source: string; url: string | null; score: number | null };
export type NoteData = CommonData & { text: string; tone: "paper" | "lilac" | "peach" };
export type LinkData = CommonData & { url: string; title: string; note: string; siteName: string; imagePath: string | null; previewUrl?: string };
export type EntityData = CommonData & {
  entityId: string; name: string; type: string; role: string; affinity: number | null; imageUrl: string | null; evidenceId: string | null;
};
export type GroupData = CommonData & { label: string };

/**
 * Signed-URL fields filled in at load time and stripped before saving, per card type. A link card's
 * `url` is its real address and is kept; only an image card's `url` is a signed display URL.
 */
export const TRANSIENT_KEYS: Partial<Record<BoardNodeType, readonly string[]>> = { image: ["url", "thumbUrl"], link: ["previewUrl"] };

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
// Over-long text is shortened to the limit rather than dropped, so a card never silently loses its text.
const str = (max: number) => z.string().transform((v) => v.slice(0, max)).catch("");
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

const fitSchema = z.object({
  level: z.enum(["strong", "partial", "off", "unknown"]), tags: z.array(z.string().max(120)).max(6), descriptors: z.array(z.string().max(40)).max(6),
  rationale: z.string().max(200), model: z.string().max(60), at: z.string().max(40),
});

/** A storage path is kept only inside this board's own media folder. */
const ownPath = (v: unknown, prefix: string) => (typeof v === "string" && v.startsWith(prefix) && !v.includes("..") && v.length <= 300 ? v : null);

/** Cleans one node's data for its type: drops unknown fields, unsafe links and foreign storage paths. */
function cleanData(type: BoardNodeType, d: Record<string, unknown>, mediaPrefix: string): Record<string, unknown> {
  const common = d.locked === true ? { locked: true } : {};
  switch (type) {
    case "image": {
      const palette = z.array(hex).max(6).catch([]).parse(d.palette);
      return {
        ...common, path: ownPath(d.path, mediaPrefix), thumbPath: ownPath(d.thumbPath, mediaPrefix), title: str(200).parse(d.title ?? ""),
        alt: str(300).parse(d.alt ?? ""), sourceUrl: safeUrl(d.sourceUrl), palette,
        ...(fitSchema.safeParse(d.fit).success ? { fit: fitSchema.parse(d.fit) } : {}),
        rights: z.enum(IMAGE_RIGHTS).catch("reference").parse(d.rights),
      } satisfies Omit<ImageData, "url" | "thumbUrl">;
    }
    case "evidence":
      return {
        ...common, evidenceId: str(80).parse(d.evidenceId ?? ""), claim: str(1200).parse(d.claim ?? ""), evidenceType: str(40).parse(d.evidenceType ?? ""),
        source: str(120).parse(d.source ?? ""), url: safeUrl(d.url), score: typeof d.score === "number" && Number.isFinite(d.score) ? d.score : null,
      } satisfies EvidenceCardData;
    case "note":
      return { ...common, text: str(4000).parse(d.text ?? ""), tone: z.enum(["paper", "lilac", "peach"]).catch("paper").parse(d.tone) } satisfies NoteData;
    case "link":
      return {
        ...common, url: safeUrl(d.url) ?? "", title: str(200).parse(d.title ?? ""), note: str(1000).parse(d.note ?? ""),
        siteName: str(120).parse(d.siteName ?? ""), imagePath: ownPath(d.imagePath, mediaPrefix),
      } satisfies Omit<LinkData, "previewUrl">;
    case "entity":
      return {
        ...common,
        entityId: str(80).parse(d.entityId ?? ""), name: str(200).parse(d.name ?? ""), type: str(40).parse(d.type ?? ""), role: str(20).parse(d.role ?? ""),
        affinity: typeof d.affinity === "number" && Number.isFinite(d.affinity) ? d.affinity : null,
        imageUrl: d.imageUrl && String(d.imageUrl).startsWith("https://") ? safeUrl(d.imageUrl) : null,
        evidenceId: typeof d.evidenceId === "string" ? d.evidenceId.slice(0, 80) : null,
      } satisfies EntityData;
    case "group":
      return { ...common, label: str(120).parse(d.label ?? "") } satisfies GroupData;
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

/** Every stored file a board's cards use (full images, thumbnails, link previews). */
export function mediaPaths(nodes: { type?: string; data: Record<string, unknown> }[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    for (const k of n.type === "image" ? ["path", "thumbPath"] : n.type === "link" ? ["imagePath"] : []) {
      const v = n.data[k];
      if (typeof v === "string" && v) out.push(v);
    }
  }
  return [...new Set(out)];
}

/** Cards that can carry a source (images, links, Qloo entities, evidence) and how many of them do. */
export function evidenceCoverage(nodes: { type?: string; data: Record<string, unknown> }[]) {
  let sourceable = 0;
  let sourced = 0;
  for (const n of nodes) {
    if (n.type === "image") { sourceable++; if (n.data.sourceUrl) sourced++; }
    else if (n.type === "link") { sourceable++; if (n.data.url) sourced++; }
    else if (n.type === "entity" || n.type === "evidence") { sourceable++; sourced++; }
  }
  return { sourceable, sourced };
}
