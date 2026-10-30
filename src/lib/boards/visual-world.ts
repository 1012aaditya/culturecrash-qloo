import type { VisualWorld } from "@/lib/reports/types";
import { colourName } from "./colour";
import { boardPalette, evidenceCoverage, IMAGE_RIGHTS } from "./schema";

export type BoardNode = { type?: string; data: Record<string, unknown> };

/** What a client sees of a board: its images (with source and rights), palette and notes. Nothing is generated. */
export function visualWorld(boardName: string, nodes: BoardNode[]): VisualWorld {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const images = nodes.filter((n) => n.type === "image" && typeof n.data.path === "string").slice(0, 9).map((n) => ({
    path: n.data.path as string,
    thumbPath: typeof n.data.thumbPath === "string" ? n.data.thumbPath : null,
    title: text(n.data.title, 140),
    alt: text(n.data.alt, 300),
    sourceUrl: typeof n.data.sourceUrl === "string" && /^https?:\/\//.test(n.data.sourceUrl) ? n.data.sourceUrl : null,
    rights: (IMAGE_RIGHTS as readonly string[]).includes(n.data.rights as string) ? (n.data.rights as VisualWorld["images"][number]["rights"]) : "reference",
  }));
  const palette = boardPalette(nodes).slice(0, 6).map((hex) => ({ hex, name: colourName(hex) }));
  return {
    boardName,
    palette,
    images,
    notes: nodes.filter((n) => n.type === "note").map((n) => text(n.data.text, 600)).filter(Boolean).slice(0, 4),
    cardCount: nodes.filter((n) => n.type !== "group").length,
    coverage: evidenceCoverage(nodes),
  };
}
