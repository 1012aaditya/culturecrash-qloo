import type { Node, Viewport } from "@xyflow/react";
import { TRANSIENT_KEYS, type BoardNodeType } from "@/lib/boards/schema";

/** Pure board helpers shared by the canvas and its tests. No React, no network. */

export type BoardNode = Node<Record<string, unknown>, BoardNodeType>;

export function stripTransient(type: string | undefined, data: Record<string, unknown>) {
  const drop = new Set<string>(TRANSIENT_KEYS[type as BoardNodeType] ?? []);
  return Object.fromEntries(Object.entries(data).filter(([k]) => !drop.has(k)));
}

/** The stored shape of one card: no selection, measurement, React Flow flags or signed URLs. */
export function storedNode(n: BoardNode) {
  return {
    id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    ...(n.width ? { width: Math.round(n.width) } : {}), ...(n.height ? { height: Math.round(n.height) } : {}),
    ...(n.parentId ? { parentId: n.parentId } : {}), ...(typeof n.zIndex === "number" ? { zIndex: n.zIndex } : {}),
    data: stripTransient(n.type, n.data),
  };
}

export function serialise(nodes: BoardNode[], viewport: Viewport | null) {
  return {
    nodes: nodes.map(storedNode),
    viewport: viewport ? { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) } : null,
  };
}

/** Identity of the cards alone (undo history, merge base). */
export const nodeKey = (n: BoardNode) => JSON.stringify(storedNode(n));
export const nodesKey = (nodes: BoardNode[]) => JSON.stringify(nodes.map(storedNode));
/** Identity of everything that is saved (cards and view). */
export const contentKey = (nodes: BoardNode[], viewport: Viewport | null) => JSON.stringify(serialise(nodes, viewport));

const host = (url: unknown) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Screen-reader label for a card. */
export function describe(n: BoardNode): string {
  const d = n.data;
  const lock = d.locked ? ", locked" : "";
  switch (n.type) {
    case "image": {
      const fit = d.fit as { level?: string; tags?: string[] } | undefined;
      const fitText = fit?.level === "strong" || fit?.level === "partial" ? `, fits ${fit.tags?.join(" and ") || "the audience partly"}` : fit?.level === "off" ? ", off-audience" : "";
      return `Image: ${String(d.alt || d.title || "untitled")}${d.sourceUrl ? `, source ${host(d.sourceUrl)}` : ", no source"}${fitText}${lock}`;
    }
    case "note": return `Note: ${String(d.text || "empty").slice(0, 80)}${lock}`;
    case "link": return `Link: ${String(d.title || host(d.url) || "untitled")}${lock}`;
    case "entity": return `Qloo ${String(d.type)}: ${String(d.name)}${typeof d.affinity === "number" ? `, affinity ${d.affinity.toFixed(2)}` : ""}${lock}`;
    case "group": return `Group: ${String(d.label || "untitled")}${lock}`;
    case "evidence": return `Evidence: ${String(d.claim || "").slice(0, 80)}${lock}`;
    default: return "Card";
  }
}

/** React Flow flags derived from card data: locked cards can't be dragged or deleted. */
export function hydrate(n: BoardNode): BoardNode {
  const locked = n.data.locked === true;
  return { ...n, draggable: !locked, deletable: !locked, ariaLabel: describe(n) };
}

/** Groups first (React Flow needs parents before children); cards whose group is gone are detached. */
export function normalise(nodes: BoardNode[]): BoardNode[] {
  const groups = new Set(nodes.filter((n) => n.type === "group").map((n) => n.id));
  return nodes
    .map((n) => (n.parentId && !groups.has(n.parentId) ? { ...n, parentId: undefined } : n))
    .sort((a, b) => Number(b.type === "group") - Number(a.type === "group"));
}

/**
 * Three-way merge after a save conflict. `base` is what this editor last saved (id → stored JSON).
 * Per card: a local change wins over the teammate's version; otherwise the teammate's version is
 * taken. Cards added on either side are kept; a deletion wins only over an unchanged card.
 */
export function mergeBoards(base: Map<string, string>, local: BoardNode[], server: BoardNode[]): BoardNode[] {
  const l = new Map(local.map((n) => [n.id, n]));
  const s = new Map(server.map((n) => [n.id, n]));
  const out: BoardNode[] = [];
  for (const id of [...new Set([...server.map((n) => n.id), ...local.map((n) => n.id)])]) {
    const b = base.get(id);
    const ln = l.get(id);
    const sn = s.get(id);
    const localChanged = ln ? nodeKey(ln) !== b : b !== undefined;
    const serverChanged = sn ? nodeKey(sn) !== b : b !== undefined;
    if (ln && sn) out.push(localChanged ? ln : sn);
    else if (ln) { if (b === undefined || localChanged) out.push(ln); }
    else if (sn) { if (b === undefined || serverChanged) out.push(sn); }
  }
  return normalise(out);
}

export type Box = { id: string; x: number; y: number; w: number; h: number };
export type AlignMode = "left" | "centre" | "right" | "top" | "middle" | "bottom";

/** New absolute positions that line up the boxes' edges or centres. */
export function align(boxes: Box[], mode: AlignMode): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 2) return out;
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  for (const b of boxes) {
    const x = mode === "left" ? minX : mode === "right" ? maxX - b.w : mode === "centre" ? (minX + maxX) / 2 - b.w / 2 : b.x;
    const y = mode === "top" ? minY : mode === "bottom" ? maxY - b.h : mode === "middle" ? (minY + maxY) / 2 - b.h / 2 : b.y;
    out.set(b.id, { x: Math.round(x), y: Math.round(y) });
  }
  return out;
}

/** Equal gaps between boxes along one axis, keeping the outermost two in place. */
export function distribute(boxes: Box[], axis: "x" | "y"): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 3) return out;
  const size = (b: Box) => (axis === "x" ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  const start = sorted[0][axis];
  const end = sorted[sorted.length - 1][axis] + size(sorted[sorted.length - 1]);
  const gap = (end - start - sorted.reduce((t, b) => t + size(b), 0)) / (sorted.length - 1);
  let at = start;
  for (const b of sorted) {
    out.set(b.id, axis === "x" ? { x: Math.round(at), y: b.y } : { x: b.x, y: Math.round(at) });
    at += size(b) + gap;
  }
  return out;
}

/** Undo history: snapshots of the cards, with a cursor. Redo entries are dropped by a new change. */
export class History {
  private stack: BoardNode[][] = [];
  private index = -1;
  constructor(private readonly limit = 100) {}
  push(nodes: BoardNode[]) {
    if (this.index >= 0 && nodesKey(this.stack[this.index]) === nodesKey(nodes)) return false;
    this.stack = [...this.stack.slice(0, this.index + 1), nodes].slice(-this.limit);
    this.index = this.stack.length - 1;
    return true;
  }
  undo() { return this.index > 0 ? this.stack[--this.index] : null; }
  redo() { return this.index < this.stack.length - 1 ? this.stack[++this.index] : null; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
}

/** True when a keyboard or clipboard event comes from a text field, which keeps its native behaviour. */
export function inTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}
