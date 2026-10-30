"use client";

import "@xyflow/react/dist/base.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type NodeChange, type OnNodeDrag } from "@xyflow/react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Frame, Pause, History as HistoryIcon, ImagePlus, LayoutGrid, Link2, List, Loader2, Maximize, Minus, PanelRightClose, PanelRightOpen, Play, Plus,
  Redo2, Sparkles, StickyNote, Trash2, Undo2, Wand2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  addBoardCommentAction, assessImageFitAction, critiqueBoardAction, deleteBoardAction, getBoardVersionAction, linkPreviewAction, listBoardCommentsAction, refreshMediaUrlsAction, renameBoardAction,
  saveBoardAction, setBoardDirectionAction, uploadBoardImageAction, type CardComment,
} from "@/lib/boards/actions";
import type { BoardDoc, DirectionOption } from "@/lib/boards/data";
import { cn } from "@/lib/utils";
import { boardPalette, evidenceCoverage, MAX_NODES, mediaPaths, safeUrl, type EntityData, type EvidenceCardData, type ImageFitData } from "@/lib/boards/schema";
import {
  align, contentKey, describe, distribute, History, hydrate, inTextField, mergeBoards, nodeKey, nodesKey, normalise, serialise, stripTransient,
  type AlignMode, type BoardNode, type Box,
} from "./board-logic";
import { CommentsPanel, CritiqueDialog, ENTITY_MIME, EVIDENCE_MIME, EvidenceMeter, HistoryDialog, LinkDialog, ListView, PaletteDialog, ResearchPanel, SaveBadge, SelectionBar, type SaveState } from "./board-panels";
import type { BoardCritique } from "@/lib/boards/critique";
import { BoardCtx, nodeTypes } from "./nodes";
import { ConceptDialog, type ConceptRequest } from "./concept-dialog";
import { conceptJobsAction, improveConceptAction, type ConceptResult } from "@/lib/concepts/actions";
import { ConceptTrailDialog } from "./concept-trail";
import type { PendingConcept } from "@/lib/concepts/data";
import { TOUCHPOINT_SLOTS, vividColour, WORLD_FRAMES_Y } from "@/lib/concepts/story";
import type { MockupFormat } from "@/lib/boards/schema";

const SAVE_DELAY_MS = 1200;
const HISTORY_SETTLE_MS = 350;
/** Signed URLs last 6 hours; they are renewed well before. */
const URL_REFRESH_MS = 5 * 60 * 60 * 1000;
const CLIP_PREFIX = "culturecrash-board:";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

async function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = src;
  });
}

/** Up to six dominant colours actually present in the image, most common first, from the local file. */
async function extractPalette(src: string): Promise<string[]> {
  try {
    const { Vibrant } = await import("node-vibrant/browser");
    const p = await Vibrant.from(src).getPalette();
    // node-vibrant synthesises missing swatches with population 0; only colours present in the image count.
    return Object.values(p).filter((s): s is NonNullable<typeof s> => Boolean(s) && s!.population > 0)
      .sort((a, b) => b.population - a.population).slice(0, 6).map((s) => s.hex.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Cards build in when the board opens, in reading order (top to bottom, left to right, a group's cards
 * after the group), so a story board unfolds chapter by chapter. Class and delay are never saved.
 */
function buildIn(nodes: BoardNode[]): BoardNode[] {
  const abs = new Map(nodes.map((n) => [n.id, n.position]));
  const at = (n: BoardNode) => {
    const p = n.parentId ? abs.get(n.parentId) : undefined;
    return { x: n.position.x + (p?.x ?? 0), y: n.position.y + (p?.y ?? 0) };
  };
  // Rows of about 300px read left to right, so a whole chapter row appears before the next.
  const order = [...nodes].sort((a, b) => Math.floor(at(a).y / 300) - Math.floor(at(b).y / 300) || at(a).x - at(b).x || at(a).y - at(b).y);
  const delay = new Map(order.map((n, i) => [n.id, Math.min(i * 28, 1600)]));
  return nodes.map((n) => ({ ...n, className: "cc-node-in", style: { ...n.style, ["--cc-delay" as string]: `${delay.get(n.id)}ms` } }));
}

/** Puts freshly signed URLs on the cards that use those files. */
function withUrls(nodes: BoardNode[], urls: Record<string, string>): BoardNode[] {
  return nodes.map((n) => {
    const d = n.data;
    if (n.type === "image" || n.type === "mockup") {
      const url = typeof d.path === "string" ? urls[d.path] : undefined;
      const thumbUrl = typeof d.thumbPath === "string" ? urls[d.thumbPath] : undefined;
      return url || thumbUrl ? { ...n, data: { ...d, ...(url ? { url } : {}), ...(thumbUrl ? { thumbUrl } : {}) } } : n;
    }
    if (n.type === "link" && typeof d.imagePath === "string" && urls[d.imagePath]) return { ...n, data: { ...d, previewUrl: urls[d.imagePath] } };
    return n;
  });
}

type CanvasProps = {
  board: BoardDoc; entities: EntityData[]; evidence: EvidenceCardData[]; directions: DirectionOption[]; canEdit: boolean; canComment: boolean;
  /** Image generation on the agency's GPU PC; null when not set up or not allowed. */
  concepts: { pending: PendingConcept[] } | null;
  /** Brand name shown on touchpoint mockups. */
  brand: string;
};
type ConceptJob = PendingConcept & { status: "queued" | "running"; position: number | null };
const CONCEPT_POLL_MS = 3000;

export function BoardCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ board, entities, evidence, directions, canEdit, canComment, concepts, brand }: CanvasProps) {
  const router = useRouter();
  const { toast } = useToast();
  const rf = useReactFlow<BoardNode>();
  const initial = React.useMemo(() => buildIn(normalise((board.content.nodes as unknown as BoardNode[]).map(hydrate))), [board.content.nodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>(initial);
  const [name, setName] = React.useState(board.name);
  const [panel, setPanel] = React.useState(entities.length > 0 || evidence.length > 0);
  const [directionId, setDirectionId] = React.useState(board.directionId);
  const [fitPending, setFitPending] = React.useState<ReadonlySet<string>>(new Set());
  const searchParams = useSearchParams();
  const [presenting, setPresenting] = React.useState(() => searchParams.get("present") === "1");
  const [slide, setSlide] = React.useState(0);
  const [autoplay, setAutoplay] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [critiqueOpen, setCritiqueOpen] = React.useState(false);
  const [critique, setCritique] = React.useState<{ data: BoardCritique | null; pending: boolean; error: string | null }>({ data: null, pending: false, error: null });
  const shell = React.useRef<HTMLDivElement>(null);
  const [listView, setListView] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [save, setSave] = React.useState<SaveState>("saved");
  const [viewTick, setViewTick] = React.useState(0);
  const [comments, setComments] = React.useState<CardComment[]>([]);
  const [commentCard, setCommentCard] = React.useState<string | null>(null);
  const [canUndoRedo, setCanUndoRedo] = React.useState({ undo: false, redo: false });
  const [conceptRequest, setConceptRequest] = React.useState<ConceptRequest | null>(null);
  const [trailCard, setTrailCard] = React.useState<string | null>(null);
  const [improvePending, setImprovePending] = React.useState<ReadonlySet<string>>(new Set());
  const [conceptJobs, setConceptJobs] = React.useState<ConceptJob[]>(() => (concepts?.pending ?? []).map((p) => ({ ...p, status: "queued", position: null })));

  const revision = React.useRef(board.revision);
  const savedKey = React.useRef(contentKey(initial, board.content.viewport));
  /** What this editor last saved, per card: the base of a three-way merge after a conflict. */
  const base = React.useRef(new Map(initial.map((n) => [n.id, nodeKey(n)])));
  const snapshotNext = React.useRef(false);
  const history = React.useRef(new History());
  const restoring = React.useRef<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cascade = React.useRef(0);
  const lastRefresh = React.useRef(0);
  const [fitOnOpen] = React.useState(() => !board.content.viewport && initial.length > 0);
  const palette = React.useMemo(() => boardPalette(nodes), [nodes]);
  const coverage = React.useMemo(() => evidenceCoverage(nodes), [nodes]);
  const selected = nodes.filter((n) => n.selected);

  // ---------------------------------------------------------------- saving (with per-card merge on conflict)
  const doSave = React.useCallback(async (): Promise<void> => {
    // Up to two merges: a teammate's save between our merge and retry is merged again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = rf.getNodes();
      const key = contentKey(current, rf.getViewport());
      if (key === savedKey.current) return setSave("saved");
      setSave(attempt ? "merging" : "saving");
      const r = await saveBoardAction(board.id, revision.current, serialise(current, rf.getViewport()), { snapshot: snapshotNext.current });
      if (r.ok) {
        snapshotNext.current = false;
        revision.current = r.data!.revision;
        savedKey.current = key;
        base.current = new Map(current.map((n) => [n.id, nodeKey(n)]));
        setSave(contentKey(rf.getNodes(), rf.getViewport()) === key ? "saved" : "dirty");
        return;
      }
      if (!(r.conflict && r.latest) || attempt === 2) {
        setSave(r.conflict ? "conflict" : "error");
        toast({ title: r.conflict ? "Board changed elsewhere" : "Not saved", description: r.error, tone: "error" });
        return;
      }
      setSave("merging");
      const server = normalise((r.latest.nodes as unknown as BoardNode[]).map(hydrate));
      const merged = mergeBoards(base.current, rf.getNodes(), server).map(hydrate);
      revision.current = r.latest.revision;
      base.current = new Map(server.map((n) => [n.id, nodeKey(n)]));
      setNodes(merged);
      toast({ title: "Merged a teammate’s changes", description: "Their edits and yours are both kept. Where you both changed the same card, your version was kept.", tone: "info" });
      // Let React Flow apply the merged cards before reading them back for the retry.
      await new Promise((res) => setTimeout(res, 0));
    }
  }, [board.id, rf, setNodes, toast]);

  React.useEffect(() => {
    if (!canEdit || save === "conflict" || save === "saving" || save === "merging") return;
    if (contentKey(nodes, rf.getViewport()) === savedKey.current) return;
    setSave("dirty");
    const t = setTimeout(() => void doSave(), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [nodes, viewTick, canEdit, save, doSave, rf]);

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving" || save === "merging") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // ---------------------------------------------------------------- undo / redo
  // Adding or removing cards is its own step at once; typing and dragging settle into one step.
  const lastIds = React.useRef(initial.map((n) => n.id).join());
  const pending = React.useRef<BoardNode[] | null>(null);
  React.useEffect(() => {
    const record = (snap: BoardNode[]) => {
      const key = nodesKey(snap);
      if (restoring.current === key) {
        restoring.current = null;
        return;
      }
      if (history.current.push(snap.map((n) => ({ ...n, selected: false })))) setCanUndoRedo({ undo: history.current.canUndo, redo: history.current.canRedo });
    };
    const ids = nodes.map((n) => n.id).join();
    if (ids !== lastIds.current) {
      lastIds.current = ids;
      if (pending.current) record(pending.current);
      pending.current = null;
      record(nodes);
      return;
    }
    pending.current = nodes;
    const t = setTimeout(() => {
      pending.current = null;
      record(nodes);
    }, HISTORY_SETTLE_MS);
    return () => clearTimeout(t);
  }, [nodes]);

  const applySnapshot = React.useCallback((snap: BoardNode[] | null) => {
    if (!snap) return;
    // Signed URLs in old snapshots may be stale; reuse the freshest ones currently on screen.
    const urls: Record<string, string> = {};
    for (const n of rf.getNodes()) {
      const d = n.data;
      if (typeof d.path === "string" && typeof d.url === "string") urls[d.path] = d.url;
      if (typeof d.thumbPath === "string" && typeof d.thumbUrl === "string") urls[d.thumbPath] = d.thumbUrl;
      if (typeof d.imagePath === "string" && typeof d.previewUrl === "string") urls[d.imagePath] = d.previewUrl;
    }
    const next = withUrls(snap, urls).map(hydrate);
    // A not-yet-recorded edit would otherwise be recorded on top and wipe the redo branch.
    pending.current = null;
    lastIds.current = next.map((n) => n.id).join();
    restoring.current = nodesKey(next);
    setNodes(next);
    setCanUndoRedo({ undo: history.current.canUndo, redo: history.current.canRedo });
  }, [rf, setNodes]);
  const undo = React.useCallback(() => applySnapshot(history.current.undo()), [applySnapshot]);
  const redo = React.useCallback(() => applySnapshot(history.current.redo()), [applySnapshot]);

  // ---------------------------------------------------------------- signed URL refresh
  const refreshUrls = React.useCallback(async () => {
    if (Date.now() - lastRefresh.current < 30_000) return;
    lastRefresh.current = Date.now();
    const paths = mediaPaths(rf.getNodes());
    if (!paths.length) return;
    const r = await refreshMediaUrlsAction(board.id, paths);
    if (r.ok && r.data) setNodes((ns) => withUrls(ns, r.data!));
  }, [board.id, rf, setNodes]);
  React.useEffect(() => {
    const t = setInterval(() => void refreshUrls(), URL_REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshUrls]);

  // ---------------------------------------------------------------- card comments (refreshed while the tab is visible)
  React.useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void listBoardCommentsAction(board.id).then((r) => { if (live && r.ok) setComments(r.data ?? []); });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, [board.id]);
  const commentCounts = React.useMemo(() => comments.reduce<Record<string, number>>((m, c) => ({ ...m, [c.cardId]: (m[c.cardId] ?? 0) + 1 }), {}), [comments]);
  const postComment = async (body: string) => {
    if (!commentCard) return "Select a card first.";
    const r = await addBoardCommentAction(board.id, commentCard, body);
    if (!r.ok) return r.error;
    setComments((cs) => [...cs, r.data!]);
    return null;
  };

  // ---------------------------------------------------------------- adding cards
  /** The visible centre, nudged diagonally for each new card so toolbar-added cards don't stack exactly. */
  const centre = React.useCallback(() => {
    const el = document.querySelector(".cc-board-flow")?.getBoundingClientRect();
    const step = (cascade.current++ % 8) * 28;
    return rf.screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 800) / 2 + step, y: (el?.top ?? 0) + (el?.height ?? 600) / 2 + step });
  }, [rf]);

  const addNodes = React.useCallback((incoming: Omit<BoardNode, "id">[] | BoardNode[]) => {
    const room = MAX_NODES - rf.getNodes().length;
    if (room <= 0 || incoming.length > room) {
      toast({ title: "Board is full", description: `A board holds up to ${MAX_NODES} cards. Start another board.`, tone: "error" });
      if (room <= 0) return [];
    }
    const made = incoming.slice(0, Math.max(0, room)).map((n) => hydrate({ ...n, id: "id" in n && n.id ? n.id : crypto.randomUUID(), selected: true, className: "cc-node-in" } as BoardNode));
    setNodes((ns) => normalise([...ns.map((x) => ({ ...x, selected: false })), ...made]));
    return made.map((n) => n.id);
  }, [rf, setNodes, toast]);
  const add = React.useCallback((node: Omit<BoardNode, "id">) => addNodes([node])[0], [addNodes]);

  const addNote = (text = "", at?: { x: number; y: number }) => { const p = at ?? centre(); add({ type: "note", position: { x: p.x - 110, y: p.y - 70 }, width: 220, height: 140, data: { text, tone: "lilac" } }); };
  const addGroup = () => { const p = centre(); add({ type: "group", position: { x: p.x - 260, y: p.y - 180 }, width: 520, height: 360, zIndex: -1, data: { label: "New group" } }); };

  /** Adds a link card at once, then fills in title, site name and preview image when they arrive. */
  const addLink = React.useCallback(async (d: { url: string; title?: string; note?: string }, at?: { x: number; y: number }) => {
    const p = at ?? centre();
    const id = add({ type: "link", position: { x: p.x - 130, y: p.y - 80 }, width: 260, height: 170,
      data: { url: d.url, title: d.title || new URL(d.url).hostname.replace(/^www\./, ""), note: d.note ?? "", siteName: "", imagePath: null } });
    if (!id) return;
    const r = await linkPreviewAction(board.id, d.url);
    if (!r.ok || !r.data) return;
    const pv = r.data;
    setNodes((ns) => ns.map((n) => n.id !== id ? n : hydrate({
      ...n,
      height: pv.previewUrl ? Math.max(n.height ?? 170, 290) : n.height,
      data: { ...n.data, title: d.title || pv.title || n.data.title, siteName: pv.siteName ?? "", imagePath: pv.imagePath, ...(pv.previewUrl ? { previewUrl: pv.previewUrl } : {}),
        note: n.data.note || (pv.description ? pv.description.slice(0, 280) : "") },
    })));
  }, [add, board.id, centre, setNodes]);

  /** Cultural-fit check for one image card; the result is stored on the card. */
  const runFit = React.useCallback(async (cardId: string, thumbPath: string, quiet = false) => {
    setFitPending((p) => new Set(p).add(cardId));
    const r = await assessImageFitAction(board.id, thumbPath);
    setFitPending((p) => { const n = new Set(p); n.delete(cardId); return n; });
    if (r.ok && r.data) setNodes((ns) => ns.map((n) => (n.id === cardId ? hydrate({ ...n, data: { ...n.data, fit: r.data } }) : n)));
    else if (!quiet) toast({ title: "Fit not checked", description: r.ok ? undefined : r.error, tone: "error" });
  }, [board.id, setNodes, toast]);
  const checkFit = React.useCallback((cardId: string) => {
    const n = rf.getNode(cardId);
    if (n?.type === "image" && typeof n.data.thumbPath === "string") void runFit(cardId, n.data.thumbPath);
  }, [rf, runFit]);

  const addEvidence = React.useCallback((e: EvidenceCardData, at?: { x: number; y: number }) => {
    const p = at ?? centre();
    add({ type: "evidence", position: { x: p.x - 140, y: p.y - 90 }, width: 280, height: 180, data: { ...e } });
  }, [add, centre]);

  const uploadFiles = React.useCallback(async (files: File[], at?: { x: number; y: number }) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    if (files.length > images.length) toast({ title: "Only images can be added", description: "Other files were skipped.", tone: "info" });
    const origin = at ?? centre();
    setUploading((n) => n + images.length);
    await Promise.all(images.map(async (file, i) => {
      const local = URL.createObjectURL(file);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const [colours, up] = await Promise.all([extractPalette(local), uploadBoardImageAction(board.id, fd)]);
        if (!up.ok) return toast({ title: `${file.name} not added`, description: up.error, tone: "error" });
        const u = up.data!;
        const size = u.width && u.height ? { w: u.width, h: u.height } : await imageSize(local);
        const width = 260;
        const height = Math.round(Math.min(560, Math.max(120, (width * size.h) / size.w))) + 64;
        const id = add({ type: "image", position: { x: origin.x - width / 2 + i * 28, y: origin.y - height / 2 + i * 28 }, width, height,
          data: { path: u.path, thumbPath: u.thumbPath, url: u.url, thumbUrl: u.thumbUrl, title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200), alt: "", sourceUrl: null, palette: colours } });
        // Checked in the background; a workspace with AI turned off simply gets no fit chip.
        if (id) void runFit(id, u.thumbPath, true);
      } finally {
        URL.revokeObjectURL(local);
        setUploading((n) => n - 1);
      }
    }));
  }, [add, board.id, centre, runFit, toast]);

  // ---------------------------------------------------------------- AI concepts from the GPU PC
  /** Places a finished concept as an "AI concept" image card, then checks its cultural fit. */
  /**
   * Places a finished concept as an "AI concept" image card, then checks its cultural fit. Visual-futures
   * frames go into their direction's group, two per row; an improved frame goes right of the one it improves.
   */
  const placeConcept = React.useCallback(async (job: PendingConcept, r: ConceptResult, i: number) => {
    const [colours, size] = await Promise.all([extractPalette(r.thumbUrl), r.width && r.height ? { w: r.width, h: r.height } : imageSize(r.thumbUrl)]);
    // Landscape frames get a wider card so the board isn't a grid of identical squares.
    const width = size.w > size.h * 1.15 ? 380 : 260;
    const height = Math.round(Math.min(560, Math.max(120, (width * size.h) / size.w))) + 64;
    const group = job.group ? rf.getNode(job.group) : undefined;
    const anchor = job.anchor ? rf.getNode(job.anchor) : undefined;
    let place: { position: { x: number; y: number }; parentId?: string };
    if (group?.type === "group") {
      // Frames line up left to right under the chapter's note; a third frame starts a new line.
      const siblings = rf.getNodes().filter((n) => n.parentId === group.id && n.type === "image");
      const line = Math.floor(siblings.length / 2);
      const inLine = siblings.filter((n) => n.position.y === WORLD_FRAMES_Y + line * 480);
      const x = inLine.reduce((m, n) => Math.max(m, n.position.x + (n.width ?? 260) + 20), 20);
      place = { parentId: group.id, position: { x, y: WORLD_FRAMES_Y + line * 480 } };
    } else if (anchor) {
      place = { parentId: anchor.parentId, position: { x: anchor.position.x + (anchor.width ?? width) + 40, y: anchor.position.y } };
    } else {
      const origin = centre();
      place = { position: { x: origin.x - width / 2 + i * 280, y: origin.y - height / 2 } };
    }
    const title = job.title ?? (job.kind === "variation" ? "AI variation" : "AI concept");
    const id = add({ type: "image", ...place, width, height,
      data: { path: r.path, thumbPath: r.thumbPath, url: r.url, thumbUrl: r.thumbUrl, title, alt: "", sourceUrl: null, palette: colours, rights: "ai",
        conceptJobId: job.id, ...(job.improvedFrom ? { improvedFrom: job.improvedFrom } : {}) } });
    // A group grows to hold what was placed in it.
    if (place.parentId) {
      const right = place.position.x + width + 20;
      const bottom = place.position.y + height + 20;
      setNodes((ns) => ns.map((n) => n.id === place.parentId && ((n.width ?? 0) < right || (n.height ?? 0) < bottom)
        ? { ...n, width: Math.max(n.width ?? 0, right), height: Math.max(n.height ?? 0, bottom) } : n));
    }
    if (id) void runFit(id, r.thumbPath, true);
    // Story boards: the frame also appears as touchpoints with the direction's copy.
    const touch = job.touch ? rf.getNode(job.touch) : undefined;
    if (touch?.type === "group") {
      const formats: MockupFormat[] = size.w > size.h * 1.15 ? ["playlist", "billboard"] : ["post", "story"];
      addNodes(formats.map((f) => ({ type: "mockup", parentId: touch.id, position: { x: TOUCHPOINT_SLOTS[f].x, y: TOUCHPOINT_SLOTS[f].y }, width: TOUCHPOINT_SLOTS[f].width, height: TOUCHPOINT_SLOTS[f].height,
        data: { format: f, path: r.path, thumbPath: r.thumbPath, url: r.url, thumbUrl: r.thumbUrl, headline: job.copy?.headline ?? title, line: job.copy?.line ?? "", brand, accent: vividColour(colours) } })));
    }
  }, [add, addNodes, brand, centre, rf, runFit, setNodes]);

  /** Any image as touchpoints: a new group beside the card with all four formats and the card's caption as headline. */
  const makeMockups = React.useCallback((cardId: string) => {
    const n = rf.getNode(cardId);
    if (n?.type !== "image" || typeof n.data.path !== "string") return;
    const parent = n.parentId ? rf.getNode(n.parentId) : undefined;
    const x = n.position.x + (parent?.position.x ?? 0) + (n.width ?? 260) + 60;
    const y = n.position.y + (parent?.position.y ?? 0);
    const group = crypto.randomUUID();
    const d = n.data;
    const formats = ["post", "story", "playlist", "billboard"] as const;
    addNodes([
      { id: group, type: "group", position: { x, y }, width: 880, height: 700, zIndex: -1, data: { label: `Touchpoints · ${String(d.title || "concept")}`.slice(0, 120) } },
      ...formats.map((f) => ({ type: "mockup" as const, parentId: group, position: { x: TOUCHPOINT_SLOTS[f].x, y: TOUCHPOINT_SLOTS[f].y }, width: TOUCHPOINT_SLOTS[f].width, height: TOUCHPOINT_SLOTS[f].height,
        data: { format: f, path: d.path, thumbPath: d.thumbPath, url: d.url, thumbUrl: d.thumbUrl, headline: String(d.title || brand || "Your headline").slice(0, 120), line: "", brand, accent: vividColour(Array.isArray(d.palette) ? d.palette as string[] : []) } })),
    ] as BoardNode[]);
    setTimeout(() => void rf.fitView({ nodes: [{ id: group }], padding: 0.15, maxZoom: 1, duration: 500 }), 60);
  }, [addNodes, brand, rf]);

  // Polls every few seconds while images are on their way; each poll's state update re-arms the next one.
  React.useEffect(() => {
    if (!conceptJobs.length) return;
    let live = true;
    const timer = setTimeout(async () => {
      const r = await conceptJobsAction(board.id, conceptJobs.map((j) => j.id));
      if (!live || !r.ok) return;
      const states = new Map(r.data!.map((s) => [s.id, s]));
      let placed = 0;
      for (const j of conceptJobs) {
        const s = states.get(j.id);
        if (s?.status === "done" && s.result) void placeConcept(j, s.result, placed++);
        else if (s?.status === "error") toast({ title: j.kind === "variation" ? "Variation not made" : "Concept not made", description: s.error ?? undefined, tone: "error" });
      }
      // Finished, failed and vanished jobs leave the list; jobs queued meanwhile are kept.
      setConceptJobs((jobs) => jobs.flatMap((j) => {
        if (!conceptJobs.some((p) => p.id === j.id)) return [j];
        const s = states.get(j.id);
        if (!s || s.status === "error" || (s.status === "done" && s.result)) return [];
        return [{ ...j, status: s.status === "done" ? "running" : s.status, position: s.position }];
      }));
    }, CONCEPT_POLL_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [board.id, conceptJobs, placeConcept, toast]);
  /** The art-director loop: rewrite a weak frame's prompt and queue the improved frame beside it. */
  const improve = React.useCallback(async (cardId: string) => {
    const n = rf.getNode(cardId);
    const fit = n?.data.fit as { level: string; rationale: string; descriptors: string[] } | undefined;
    if (n?.type !== "image" || typeof n.data.thumbPath !== "string" || !fit || (fit.level !== "partial" && fit.level !== "off")) return;
    setImprovePending((p) => new Set(p).add(cardId));
    const r = await improveConceptAction(board.id, {
      cardId, thumbPath: n.data.thumbPath, jobId: typeof n.data.conceptJobId === "string" ? n.data.conceptJobId : null, title: String(n.data.title ?? ""),
      fit: { level: fit.level, rationale: fit.rationale, descriptors: fit.descriptors },
    });
    setImprovePending((p) => { const x = new Set(p); x.delete(cardId); return x; });
    if (!r.ok) return void toast({ title: "Not improved", description: r.error, tone: "error" });
    toast({ title: "Art director is on it", description: `${r.data!.diagnosis} Changes: ${r.data!.changes.join("; ")}.`, tone: "info" });
    setConceptJobs((js) => [...js, { id: r.data!.id, kind: "concept", title: `Improved · ${String(n.data.title ?? "concept")}`.slice(0, 80), anchor: cardId, improvedFrom: fit.level, status: "queued", position: null }]);
  }, [board.id, rf, toast]);

  const makeVariations = React.useCallback((cardId: string) => {
    const n = rf.getNode(cardId);
    if (n?.type === "image" && typeof n.data.path === "string") setConceptRequest({ kind: "variation", sourcePath: n.data.path, sourceTitle: String(n.data.title ?? "") });
  }, [rf]);

  const addEntity = React.useCallback((e: EntityData, at?: { x: number; y: number }) => {
    const p = at ?? centre();
    add({ type: "entity", position: { x: p.x - 100, y: p.y - 110 }, width: 200, height: 220, data: { ...e } });
  }, [add, centre]);

  const onDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ev = e.dataTransfer.getData(EVIDENCE_MIME);
    if (ev) {
      try {
        addEvidence(JSON.parse(ev) as EvidenceCardData, at);
      } catch { /* not ours */ }
      return;
    }
    const raw = e.dataTransfer.getData(ENTITY_MIME);
    if (raw) {
      try {
        addEntity(JSON.parse(raw) as EntityData, at);
      } catch { /* not ours */ }
      return;
    }
    if (e.dataTransfer.files.length) return void uploadFiles([...e.dataTransfer.files], at);
    const url = safeUrl(e.dataTransfer.getData("text/uri-list").split("\n")[0] || e.dataTransfer.getData("text/plain"));
    if (url) void addLink({ url }, at);
  };

  // ---------------------------------------------------------------- selection actions
  const absBox = React.useCallback((n: BoardNode): Box => {
    const abs = rf.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position;
    return { id: n.id, x: abs.x, y: abs.y, w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 };
  }, [rf]);

  /** Moves cards to absolute positions, converting to group-relative positions for grouped cards. */
  const moveTo = React.useCallback((moves: Map<string, { x: number; y: number }>) => {
    if (!moves.size) return;
    setNodes((ns) => ns.map((n) => {
      const m = moves.get(n.id);
      if (!m) return n;
      const parentAbs = n.parentId ? rf.getInternalNode(n.parentId)?.internals.positionAbsolute : null;
      return { ...n, position: parentAbs ? { x: m.x - parentAbs.x, y: m.y - parentAbs.y } : m };
    }));
  }, [rf, setNodes]);

  const movable = React.useCallback(() => rf.getNodes().filter((n) => n.selected && !n.data.locked), [rf]);
  const doAlign = (mode: AlignMode) => moveTo(align(movable().map(absBox), mode));
  const doDistribute = (axis: "x" | "y") => moveTo(distribute(movable().map(absBox), axis));

  const duplicate = React.useCallback(() => {
    const sel = rf.getNodes().filter((n) => n.selected);
    if (!sel.length) return;
    const ids = new Map(sel.map((n) => [n.id, crypto.randomUUID()]));
    addNodes(sel.map((n) => ({
      ...n, id: ids.get(n.id)!, selected: true,
      parentId: n.parentId && ids.has(n.parentId) ? ids.get(n.parentId) : n.parentId,
      position: n.parentId && ids.has(n.parentId) ? n.position : { x: n.position.x + 32, y: n.position.y + 32 },
      data: { ...n.data, locked: false },
    })));
  }, [addNodes, rf]);

  const toggleLock = React.useCallback(() => {
    const sel = rf.getNodes().filter((n) => n.selected);
    if (!sel.length) return;
    const lock = sel.some((n) => !n.data.locked);
    setNodes((ns) => ns.map((n) => (n.selected ? hydrate({ ...n, data: { ...n.data, locked: lock } }) : n)));
  }, [rf, setNodes]);

  const reorder = React.useCallback((front: boolean) => {
    const cards = rf.getNodes().filter((n) => n.type !== "group");
    const zs = cards.map((n) => n.zIndex ?? 0);
    const top = Math.max(0, ...zs) + 1;
    const bottom = Math.min(0, ...zs) - 1;
    setNodes((ns) => ns.map((n) => (n.selected && n.type !== "group" ? { ...n, zIndex: front ? top : bottom } : n)));
  }, [rf, setNodes]);

  const deleteSelected = React.useCallback(() => void rf.deleteElements({ nodes: rf.getNodes().filter((n) => n.selected && !n.data.locked) }), [rf]);

  // ---------------------------------------------------------------- keyboard, copy and paste
  React.useEffect(() => {
    if (presenting) return; // the presentation has its own keys
    const onKey = (e: KeyboardEvent) => {
      if (inTextField(e.target) || listView) return;
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "a") { e.preventDefault(); setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); return; }
      if (k === "escape") { setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); return; }
      if (!canEdit) return;
      if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && k === "y") { e.preventDefault(); return redo(); }
      if (mod && k === "d") { e.preventDefault(); return duplicate(); }
      if (mod && e.shiftKey && k === "l") { e.preventDefault(); return toggleLock(); }
      if (!mod && e.key === "]") return reorder(true);
      if (!mod && e.key === "[") return reorder(false);
    };
    const copySelection = (e: ClipboardEvent) => {
      const sel = rf.getNodes().filter((n) => n.selected);
      if (!sel.length || !e.clipboardData) return false;
      const ids = new Set(sel.map((n) => n.id));
      const cards = sel.map((n) => {
        const abs = rf.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position;
        const keepParent = n.parentId && ids.has(n.parentId);
        return { ...serialise([n], null).nodes[0], position: keepParent ? n.position : { x: abs.x, y: abs.y }, parentId: keepParent ? n.parentId : undefined };
      });
      e.clipboardData.setData("text/plain", CLIP_PREFIX + JSON.stringify({ boardId: board.id, cards }));
      e.preventDefault();
      return true;
    };
    const onCopy = (e: ClipboardEvent) => { if (!inTextField(e.target)) copySelection(e); };
    const onCut = (e: ClipboardEvent) => { if (!inTextField(e.target) && canEdit && copySelection(e)) deleteSelected(); };
    const onPaste = async (e: ClipboardEvent) => {
      if (inTextField(e.target) || !canEdit || !e.clipboardData) return;
      const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); return void uploadFiles(files); }
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      if (text.startsWith(CLIP_PREFIX)) {
        try {
          const { boardId, cards } = JSON.parse(text.slice(CLIP_PREFIX.length)) as { boardId: string; cards: BoardNode[] };
          const sameBoard = boardId === board.id;
          const usable = cards.filter((c) => sameBoard || mediaPaths([c]).length === 0);
          if (usable.length < cards.length) toast({ title: "Some cards weren’t pasted", description: "Images and link previews can only be pasted within the same board for now.", tone: "info" });
          const ids = new Map(usable.map((c) => [c.id, crypto.randomUUID()]));
          const made = usable.map((c) => ({
            ...c, id: ids.get(c.id)!, parentId: c.parentId && ids.has(c.parentId) ? ids.get(c.parentId) : undefined,
            position: c.parentId && ids.has(c.parentId) ? c.position : { x: c.position.x + 32, y: c.position.y + 32 }, data: { ...stripTransient(c.type, c.data), locked: false },
          })) as BoardNode[];
          addNodes(made);
          const paths = mediaPaths(made);
          if (paths.length) {
            const r = await refreshMediaUrlsAction(board.id, paths);
            if (r.ok && r.data) setNodes((ns) => withUrls(ns, r.data!));
          }
        } catch {
          toast({ title: "Nothing to paste", tone: "error" });
        }
        return;
      }
      const url = /^\S+$/.test(text.trim()) ? safeUrl(text.trim()) : null;
      if (url) return void addLink({ url });
      addNote(text.slice(0, 4000));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
    // addNote is recreated each render but only closes over stable helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLink, addNodes, board.id, canEdit, deleteSelected, duplicate, listView, presenting, redo, reorder, rf, setNodes, toast, toggleLock, undo, uploadFiles]);

  // ---------------------------------------------------------------- grouping: drop a card inside a group to attach it
  const onNodeDragStop: OnNodeDrag<BoardNode> = React.useCallback((_, dragged) => {
    if (dragged.type === "group") return;
    const box = absBox(dragged);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const target = rf.getNodes().filter((n) => n.type === "group").find((g) => {
      const gb = absBox(g);
      return cx >= gb.x && cx <= gb.x + gb.w && cy >= gb.y && cy <= gb.y + gb.h;
    });
    if ((target?.id ?? undefined) === dragged.parentId) return;
    const ga = target ? absBox(target) : null;
    setNodes((ns) => normalise(ns.map((n) => n.id !== dragged.id ? n : ({
      ...n, parentId: target?.id, position: ga ? { x: box.x - ga.x, y: box.y - ga.y } : { x: box.x, y: box.y },
    }))));
  }, [absBox, rf, setNodes]);

  /** Deleting a group keeps its cards: they are detached in place instead of deleted with it. */
  const onBeforeDelete = React.useCallback(async ({ nodes: del }: { nodes: BoardNode[] }) => {
    const groups = new Set(del.filter((n) => n.type === "group").map((n) => n.id));
    if (!groups.size) return true;
    // React Flow adds a deleted group's children to `del` itself; only cards the user selected are really deleted.
    const keep = rf.getNodes().filter((n) => n.parentId && groups.has(n.parentId) && !n.selected);
    setNodes((ns) => ns.filter((n) => !groups.has(n.id)).map((n) => {
      if (!keep.some((k) => k.id === n.id)) return n;
      const abs = rf.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position;
      return { ...n, parentId: undefined, position: { x: abs.x, y: abs.y } };
    }));
    return { nodes: del.filter((n) => !groups.has(n.id) && !keep.some((k) => k.id === n.id)), edges: [] };
  }, [rf, setNodes]);

  const handleNodesChange = React.useCallback((changes: NodeChange<BoardNode>[]) => {
    onNodesChange(canEdit ? changes : changes.filter((c) => c.type === "select" || c.type === "dimensions"));
  }, [canEdit, onNodesChange]);

  // ---------------------------------------------------------------- board-level actions
  const restoreVersion = async (versionId: string) => {
    const r = await getBoardVersionAction(versionId);
    if (!r.ok || !r.data) return void toast({ title: "Not restored", description: r.ok ? "That version is empty." : r.error, tone: "error" });
    snapshotNext.current = true;
    setNodes(normalise((r.data.nodes as unknown as BoardNode[]).map(hydrate)));
    toast({ title: "Version restored", description: "Press ⌘Z to undo the restore.", tone: "success" });
  };

  const locate = (id: string) => {
    setListView(false);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    setTimeout(() => void rf.fitView({ nodes: [{ id }], maxZoom: 1.2, padding: 0.6, duration: 400 }), 50);
  };

  // ---------------------------------------------------------------- presentation: an overview, then one group per slide
  const slides = React.useMemo(() => {
    const groups = nodes.filter((n) => n.type === "group").sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    return [{ label: "Overview", ids: nodes.map((n) => n.id) }, ...groups.map((g) => ({ label: String(g.data.label || "Group"), ids: [g.id, ...nodes.filter((n) => n.parentId === g.id).map((n) => n.id)] }))];
  }, [nodes]);
  const showSlide = React.useCallback((i: number) => {
    const s = slides[Math.max(0, Math.min(slides.length - 1, i))];
    setSlide(slides.indexOf(s));
    // fitBounds moves at once; fitView waits for the next node change, which never comes while presenting.
    if (s.ids.length) void rf.fitBounds(rf.getNodesBounds(s.ids), { padding: 0.08, duration: 600 });
  }, [rf, slides]);
  // Animatic: auto-play glides through the chapters, holding each long enough to read; stops at the end.
  React.useEffect(() => {
    if (!presenting || !autoplay) return;
    const last = slide >= slides.length - 1;
    const t = setTimeout(() => (last ? setAutoplay(false) : showSlide(slide + 1)), slide === 0 ? 3500 : 7000);
    return () => clearTimeout(t);
  }, [presenting, autoplay, slide, slides.length, showSlide]);

  const startPresenting = () => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setPresenting(true);
    void shell.current?.requestFullscreen?.().catch(() => {});
    setTimeout(() => showSlide(0), 50);
  };
  const stopPresenting = React.useCallback(() => {
    setPresenting(false);
    setAutoplay(false);
    if (location.search.includes("present=1")) window.history.replaceState(null, "", location.pathname);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  React.useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); showSlide(slide + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); showSlide(slide - 1); }
      else if (e.key === "Escape") stopPresenting();
    };
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
  }, [presenting, showSlide, slide, stopPresenting]);

  // ---------------------------------------------------------------- AI critique
  const runCritique = async () => {
    setCritique({ data: null, pending: true, error: null });
    const r = await critiqueBoardAction(board.id, serialise(rf.getNodes(), null).nodes);
    setCritique(r.ok ? { data: r.data!, pending: false, error: null } : { data: null, pending: false, error: r.error });
  };
  const keepCritique = () => {
    const c = critique.data;
    if (!c) return;
    addNote([`Critique: ${c.summary}`, ...c.nextSteps.map((s, i) => `${i + 1}. ${s}`)].join("\n").slice(0, 4000));
    setCritiqueOpen(false);
  };
  const locateMany = (ids: string[]) => {
    setCritiqueOpen(false);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: ids.includes(n.id) })));
    setTimeout(() => void rf.fitView({ nodes: ids.map((id) => ({ id })), maxZoom: 1.2, padding: 0.5, duration: 400 }), 50);
  };

  const rename = async () => {
    const next = name.trim();
    if (!next || next === board.name) return setName(board.name);
    const r = await renameBoardAction(board.id, next);
    if (!r.ok) {
      setName(board.name);
      toast({ title: "Not renamed", description: r.error, tone: "error" });
    } else router.refresh();
  };

  const remove = async () => {
    const r = await deleteBoardAction(board.id);
    if (!r.ok) return toast({ title: "Not deleted", description: r.error, tone: "error" });
    router.push(`/projects/${board.projectId}/boards`);
  };

  const mod = isMac() ? "⌘" : "Ctrl+";
  const ctx = React.useMemo(() => ({ canEdit, projectId: board.projectId, onMediaError: () => void refreshUrls(), commentCounts, openComments: setCommentCard, checkFit, fitPending, presenting,
    makeVariations: concepts ? makeVariations : null, makeMockups, improve: concepts ? (id: string) => void improve(id) : null, improvePending, openTrail: setTrailCard,
  }), [canEdit, board.projectId, refreshUrls, commentCounts, checkFit, fitPending, presenting, concepts, makeVariations, makeMockups, improve, improvePending]);

  return (
    <BoardCtx.Provider value={ctx}>
      <div ref={shell} className={cn("relative overflow-hidden", presenting ? "fixed inset-0 z-50 bg-charcoal" : "h-[calc(100dvh-210px)] min-h-[560px] rounded-cc-lg border border-line bg-ivory")}>
        <div className="cc-atmosphere pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className={cn("absolute inset-y-0 left-0 transition-[right] duration-300", panel && !presenting ? "right-0 lg:right-[300px]" : "right-0")} onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow<BoardNode>
            className="cc-board-flow"
            aria-label={`Inspiration board “${name}”. Use Tab to move between cards; arrow keys move the selected card.`}
            nodes={nodes}
            onNodesChange={handleNodesChange}
            nodeTypes={nodeTypes}
            onNodeDragStop={onNodeDragStop}
            onBeforeDelete={onBeforeDelete}
            onMoveEnd={() => setViewTick((t) => t + 1)}
            defaultViewport={board.content.viewport ?? undefined}
            fitView={fitOnOpen}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            onlyRenderVisibleElements
            minZoom={0.1}
            maxZoom={4}
            nodesDraggable={canEdit && !presenting}
            nodesConnectable={false}
            elementsSelectable={!presenting}
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            selectionKeyCode="Shift"
            selectionOnDrag={false}
            panOnScroll
            zoomOnPinch
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color={presenting ? "#2b2836" : "#d9d3cc"} bgColor={presenting ? "#17151e" : undefined} />
            {!presenting && <MiniMap pannable zoomable className="!rounded-cc !border !border-line !bg-paper/80 !shadow-card max-md:!hidden" maskColor="rgba(247,245,242,0.7)"
              nodeColor={(n) => (n.type === "group" ? "rgba(184,165,255,0.35)" : n.type === "entity" ? "#8064F5" : "#e9e5e1")} />}
          </ReactFlow>

          {nodes.length === 0 && !listView && !presenting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <p className="cc-display text-3xl">An empty wall.</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {canEdit ? `Drop or paste images and links here, add notes from the toolbar, or drag cultural entities in from the panel. ${mod}Z undoes anything.` : "Nothing has been added to this board yet."}
                </p>
              </div>
            </div>
          )}
          {listView && <ListView nodes={nodes} onLocate={locate} />}
        </div>

        {/* Top toolbar */}
        {!presenting && <div className={cn("cc-glass absolute left-3 right-14 top-3 z-10 flex flex-wrap items-center gap-1 rounded-cc-lg p-1.5 lg:right-auto", panel ? "lg:max-w-[calc(100%-370px)]" : "lg:max-w-[calc(100%-68px)]")}>
          <Button asChild variant="ghost" size="icon-sm" aria-label="All boards"><Link href={`/projects/${board.projectId}/boards`}><ArrowLeft /></Link></Button>
          <input aria-label="Board name" value={name} disabled={!canEdit} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={rename}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-[min(220px,40vw)] truncate rounded-full bg-transparent px-2 py-1 text-[14px] font-medium tracking-tight outline-none focus:bg-paper/80" />
          {canEdit && (
            <>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
                {uploading > 0 ? <Loader2 className="animate-spin" /> : <ImagePlus />} Image
              </Button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden
                onChange={(e) => { void uploadFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <Button variant="ghost" size="sm" onClick={() => addNote()}><StickyNote /> Note</Button>
              <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}><Link2 /> Link</Button>
              <Button variant="ghost" size="sm" onClick={addGroup}><Frame /> Group</Button>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <Button variant="ghost" size="icon-sm" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!canUndoRedo.undo} onClick={undo}><Undo2 /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Redo (${mod}⇧Z)`} title={`Redo (${mod}⇧Z)`} disabled={!canUndoRedo.redo} onClick={redo}><Redo2 /></Button>
            </>
          )}
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
          <Button variant="ghost" size="icon-sm" aria-pressed={listView} aria-label={listView ? "Show canvas" : "Show as list"} title={listView ? "Show canvas" : "Show as list"} onClick={() => setListView((v) => !v)}>
            {listView ? <LayoutGrid /> : <List />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Version history" title="Version history" onClick={() => setHistoryOpen(true)}><HistoryIcon /></Button>
          {directions.length > 0 && (
            <select aria-label="Strategy direction for this board" value={directionId ?? ""} disabled={!canEdit}
              onChange={async (e) => {
                const next = e.target.value || null;
                const prev = directionId;
                setDirectionId(next);
                const r = await setBoardDirectionAction(board.id, next);
                if (!r.ok) { setDirectionId(prev); toast({ title: "Not linked", description: r.error, tone: "error" }); }
              }}
              className="h-8 max-w-[200px] truncate rounded-full border border-line bg-paper/80 px-2.5 text-[12px] outline-none focus:border-violet">
              <option value="">No direction</option>
              {directions.map((d) => <option key={d.id} value={d.id}>{`Direction 0${d.slot}: ${d.name}${d.selected ? " (selected)" : ""}`}</option>)}
              {directionId && !directions.some((d) => d.id === directionId) && <option value={directionId}>An earlier strategy version</option>}
            </select>
          )}
          <EvidenceMeter {...coverage} />
          <SaveBadge state={canEdit ? save : "saved"} readOnly={!canEdit} onReload={() => router.refresh()} onRetry={() => void doSave()} />
          <Button variant="ghost" size="icon-sm" aria-label="AI critique" title="AI critique" onClick={() => setCritiqueOpen(true)}><Sparkles /></Button>
          {concepts && <Button variant="ghost" size="icon-sm" aria-label="Generate concepts" title="Generate concepts (AI, on the agency’s GPU PC)" onClick={() => setConceptRequest({ kind: "concept" })}><Wand2 /></Button>}
          <Button variant="ghost" size="icon-sm" aria-label="Present" title="Present (full screen, one group at a time)" disabled={!nodes.length} onClick={startPresenting}><Play /></Button>
          {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Delete board" title="Delete board" onClick={() => setDeleteOpen(true)}><Trash2 /></Button>}
        </div>}

        {/* Bottom-left: zoom and palette */}
        {!presenting && <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2">
          <div className="cc-glass flex items-center gap-0.5 rounded-full p-1">
            <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => rf.zoomOut()}><Minus /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Fit board" onClick={() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 400 })}><Maximize /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => rf.zoomIn()}><Plus /></Button>
          </div>
          {conceptJobs.length > 0 && (
            <div className="cc-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]" role="status" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin text-violet" />
              {conceptJobs.some((j) => j.status === "running")
                ? `Generating ${conceptJobs.length} ${conceptJobs.length === 1 ? "image" : "images"}…`
                : `${conceptJobs.length} ${conceptJobs.length === 1 ? "image" : "images"} waiting for the GPU PC${conceptJobs[0].position ? ` · #${conceptJobs[0].position} in line` : ""}`}
            </div>
          )}
          {palette.length > 0 && selected.length === 0 && (
            <div className="cc-glass flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5">
              <button type="button" className="cc-eyebrow text-muted hover:text-ink" onClick={() => setPaletteOpen(true)} title="Names, contrast and CSS">Palette</button>
              {palette.map((c) => (
                <button key={c} type="button" title={`Copy ${c}`} aria-label={`Copy colour ${c}`} className="size-6 rounded-full border-2 border-paper shadow-card transition-transform hover:scale-110"
                  style={{ background: c }}
                  onClick={() => { void navigator.clipboard?.writeText(c); toast({ title: `Copied ${c}`, tone: "success" }); }} />
              ))}
            </div>
          )}
        </div>}

        {canEdit && selected.length > 0 && !listView && !presenting && (
          <SelectionBar count={selected.length} locked={selected.every((n) => n.data.locked)} onDuplicate={duplicate} onLock={toggleLock}
            onFront={() => reorder(true)} onBack={() => reorder(false)} onAlign={doAlign} onDistribute={doDistribute} onDelete={deleteSelected}
            onComments={() => setCommentCard(selected[0].id)} />
        )}

        {presenting && (
          <div className="absolute inset-x-0 bottom-5 z-30 flex justify-center">
            <div className="flex items-center gap-1 rounded-full bg-paper/90 px-2 py-1.5 shadow-float backdrop-blur" role="toolbar" aria-label="Presentation controls">
              <Button variant="ghost" size="icon-sm" aria-label={autoplay ? "Pause auto-play" : "Auto-play the story"} title={autoplay ? "Pause" : "Auto-play: glide through every chapter"} aria-pressed={autoplay}
                onClick={() => { if (!autoplay && slide >= slides.length - 1) showSlide(0); setAutoplay((a) => !a); }}>{autoplay ? <Pause /> : <Play />}</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={slide === 0} onClick={() => { setAutoplay(false); showSlide(slide - 1); }}><ChevronLeft /></Button>
              <span className="min-w-36 px-2 text-center text-[13px] font-medium" aria-live="polite">{slides[slide]?.label} <span className="text-muted">· {slide + 1}/{slides.length}</span></span>
              <Button variant="ghost" size="icon-sm" aria-label="Next" disabled={slide >= slides.length - 1} onClick={() => { setAutoplay(false); showSlide(slide + 1); }}><ChevronRight /></Button>
              <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}${location.pathname}?present=1`); toast({ title: "Presentation link copied", description: "Opens straight into presentation mode for anyone in this workspace.", tone: "success" }); }}><Link2 /> Copy link</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Exit presentation" title="Exit (Esc)" onClick={stopPresenting}><X /></Button>
            </div>
          </div>
        )}

        {/* Right: Qloo entities */}
        {!presenting && <Button variant="outline" size="icon-sm" className="absolute right-3 top-3 z-20 shadow-card" aria-label={panel ? "Hide research panel" : "Show research panel"} onClick={() => setPanel((p) => !p)}>
          {panel ? <PanelRightClose /> : <PanelRightOpen />}
        </Button>}
        {panel && !presenting && <ResearchPanel entities={entities} evidence={evidence} canEdit={canEdit} onAddEntity={(e) => addEntity(e)} onAddEvidence={(e) => addEvidence(e)} projectId={board.projectId} />}

        {commentCard && !presenting && (
          <CommentsPanel
            cardLabel={(() => { const n = nodes.find((x) => x.id === commentCard); return n ? describe(n) : "Removed card"; })()}
            comments={comments.filter((c) => c.cardId === commentCard)} canComment={canComment} onPost={postComment} onClose={() => setCommentCard(null)} />
        )}

        <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} onAdd={(d) => void addLink(d)} />
        <PaletteDialog palette={palette} open={paletteOpen} onOpenChange={setPaletteOpen} onCopied={(what) => toast({ title: `Copied ${what}`, tone: "success" })} />
        {concepts && conceptRequest && <ConceptDialog boardId={board.id} request={conceptRequest} onClose={() => setConceptRequest(null)}
          onQueued={(ids, kind) => setConceptJobs((js) => [...js, ...ids.map((id) => ({ id, kind, status: "queued" as const, position: null }))])} />}
        {trailCard && (() => {
          const n = nodes.find((x) => x.id === trailCard);
          return n && typeof n.data.conceptJobId === "string" ? (
            <ConceptTrailDialog boardId={board.id} jobId={n.data.conceptJobId} title={String(n.data.title ?? "")} fit={n.data.fit as ImageFitData | undefined}
              improvedFrom={typeof n.data.improvedFrom === "string" ? n.data.improvedFrom : undefined} onClose={() => setTrailCard(null)} />
          ) : null;
        })()}
        <CritiqueDialog open={critiqueOpen} onOpenChange={setCritiqueOpen} critique={critique.data} pending={critique.pending} error={critique.error}
          onRun={() => void runCritique()} onLocate={locateMany} onKeep={keepCritique} canEdit={canEdit} />
        <HistoryDialog boardId={board.id} open={historyOpen} onOpenChange={setHistoryOpen} onRestore={restoreVersion} canEdit={canEdit} />

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent title={`Delete “${board.name}”?`} description="The board, its cards, its version history and its uploaded images are removed. Research, evidence and Qloo entities are not affected.">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={remove}>Delete board</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </BoardCtx.Provider>
  );
}
