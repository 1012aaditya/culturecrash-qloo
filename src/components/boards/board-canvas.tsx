"use client";

import "@xyflow/react/dist/base.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Node, type NodeChange, type OnNodeDrag, type Viewport,
} from "@xyflow/react";
import {
  ArrowLeft, Check, CloudOff, Frame, ImagePlus, Link2, Loader2, Maximize, Minus, PanelRightClose, PanelRightOpen, Plus, Search, Sparkles, StickyNote, Trash2,
} from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { deleteBoardAction, renameBoardAction, saveBoardAction, uploadBoardImageAction } from "@/lib/boards/actions";
import type { BoardDoc } from "@/lib/boards/data";
import { boardPalette, MAX_NODES, safeUrl, type BoardNodeType, type EntityData } from "@/lib/boards/schema";
import { cn } from "@/lib/utils";
import { BoardCtx, nodeTypes } from "./nodes";

type BoardNode = Node<Record<string, unknown>, BoardNodeType>;
type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const ENTITY_MIME = "application/x-culturecrash-entity";
const SAVE_DELAY_MS = 1200;
const TRANSIENT = new Set(["url"]);

/** What gets stored: no selection, measurement or signed-URL state. */
function serialise(nodes: BoardNode[], viewport: Viewport | null) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      ...(n.width ? { width: Math.round(n.width) } : {}), ...(n.height ? { height: Math.round(n.height) } : {}),
      ...(n.parentId ? { parentId: n.parentId } : {}), ...(typeof n.zIndex === "number" ? { zIndex: n.zIndex } : {}),
      data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !TRANSIENT.has(k))),
    })),
    viewport: viewport ? { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) } : null,
  };
}
/** Change detection covers cards and the saved view, so panning or zooming is kept too. */
const contentKey = (nodes: BoardNode[], viewport: Viewport | null) => JSON.stringify(serialise(nodes, viewport));

async function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = src;
  });
}

/** Up to six dominant colours, most common first. Runs in the browser on the local file, before upload. */
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

export function BoardCanvas(props: { board: BoardDoc; entities: EntityData[]; canEdit: boolean }) {
  return (
    <ReactFlowProvider>
      <BoardCtx.Provider value={{ canEdit: props.canEdit, projectId: props.board.projectId }}>
        <Canvas {...props} />
      </BoardCtx.Provider>
    </ReactFlowProvider>
  );
}

function Canvas({ board, entities, canEdit }: { board: BoardDoc; entities: EntityData[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const rf = useReactFlow<BoardNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>(board.content.nodes as unknown as BoardNode[]);
  const [name, setName] = React.useState(board.name);
  const [panel, setPanel] = React.useState(entities.length > 0);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [save, setSave] = React.useState<SaveState>("saved");
  const revision = React.useRef(board.revision);
  const savedKey = React.useRef(contentKey(board.content.nodes as unknown as BoardNode[], board.content.viewport));
  const [viewTick, setViewTick] = React.useState(0);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const palette = React.useMemo(() => boardPalette(nodes), [nodes]);
  // Fit only when the board opens without a saved viewport; recomputing it per render re-fits on every added card.
  const [fitOnOpen] = React.useState(() => !board.content.viewport && board.content.nodes.length > 0);
  const cascade = React.useRef(0);

  // ---------------------------------------------------------------- autosave
  const doSave = React.useCallback(async () => {
    const current = rf.getNodes();
    const key = contentKey(current, rf.getViewport());
    if (key === savedKey.current) return setSave("saved");
    setSave("saving");
    const r = await saveBoardAction(board.id, revision.current, serialise(current, rf.getViewport()));
    if (r.ok) {
      revision.current = r.data!.revision;
      savedKey.current = key;
      setSave(contentKey(rf.getNodes(), rf.getViewport()) === key ? "saved" : "dirty");
    } else {
      setSave(r.conflict ? "conflict" : "error");
      toast({ title: r.conflict ? "Board changed elsewhere" : "Not saved", description: r.error, tone: "error" });
    }
  }, [board.id, rf, toast]);

  React.useEffect(() => {
    if (!canEdit || save === "conflict" || save === "saving") return;
    if (contentKey(nodes, rf.getViewport()) === savedKey.current) return;
    setSave("dirty");
    const t = setTimeout(doSave, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [nodes, viewTick, canEdit, save, doSave, rf]);

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // ---------------------------------------------------------------- adding cards
  /** The visible centre, nudged diagonally for each new card so toolbar-added cards don't stack exactly. */
  const centre = React.useCallback(() => {
    const el = document.querySelector(".cc-board-flow")?.getBoundingClientRect();
    const step = (cascade.current++ % 8) * 28;
    return rf.screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 800) / 2 + step, y: (el?.top ?? 0) + (el?.height ?? 600) / 2 + step });
  }, [rf]);

  const add = React.useCallback((node: Omit<BoardNode, "id">) => {
    if (rf.getNodes().length >= MAX_NODES) {
      toast({ title: "Board is full", description: `A board holds up to ${MAX_NODES} cards. Start another board.`, tone: "error" });
      return;
    }
    const n = { ...node, id: crypto.randomUUID(), selected: true } as BoardNode;
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), n].sort((a, b) => Number(b.type === "group") - Number(a.type === "group")));
  }, [rf, setNodes, toast]);

  const addNote = () => { const p = centre(); add({ type: "note", position: { x: p.x - 110, y: p.y - 70 }, width: 220, height: 140, data: { text: "", tone: "lilac" } }); };
  const addGroup = () => { const p = centre(); add({ type: "group", position: { x: p.x - 260, y: p.y - 180 }, width: 520, height: 360, zIndex: -1, data: { label: "New group" } }); };

  const uploadFiles = React.useCallback(async (files: File[], at?: { x: number; y: number }) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    if (files.length > images.length) toast({ title: "Only images can be added", description: "Other files were skipped.", tone: "info" });
    const origin = at ?? centre();
    setUploading((n) => n + images.length);
    await Promise.all(images.map(async (file, i) => {
      const local = URL.createObjectURL(file);
      try {
        const [size, colours, up] = await Promise.all([imageSize(local), extractPalette(local), (async () => {
          const fd = new FormData();
          fd.set("file", file);
          return uploadBoardImageAction(board.id, fd);
        })()]);
        if (!up.ok) return toast({ title: `${file.name} not added`, description: up.error, tone: "error" });
        const width = 260;
        const height = Math.round(Math.min(560, Math.max(120, (width * size.h) / size.w))) + 64;
        add({ type: "image", position: { x: origin.x - width / 2 + i * 28, y: origin.y - height / 2 + i * 28 }, width, height,
          data: { path: up.data!.path, url: up.data!.url, title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200), sourceUrl: null, palette: colours } });
      } finally {
        URL.revokeObjectURL(local);
        setUploading((n) => n - 1);
      }
    }));
  }, [add, board.id, centre, toast]);

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
    const raw = e.dataTransfer.getData(ENTITY_MIME);
    if (raw) {
      try {
        addEntity(JSON.parse(raw) as EntityData, at);
      } catch { /* not ours */ }
      return;
    }
    if (e.dataTransfer.files.length) void uploadFiles([...e.dataTransfer.files], at);
  };

  // ---------------------------------------------------------------- grouping: drop a card inside a group to attach it
  const onNodeDragStop: OnNodeDrag<BoardNode> = React.useCallback((_, dragged) => {
    if (dragged.type === "group") return;
    const abs = rf.getInternalNode(dragged.id)?.internals.positionAbsolute;
    if (!abs) return;
    const w = dragged.measured?.width ?? dragged.width ?? 0;
    const h = dragged.measured?.height ?? dragged.height ?? 0;
    const cx = abs.x + w / 2;
    const cy = abs.y + h / 2;
    const target = rf.getNodes().filter((n) => n.type === "group").find((g) => {
      const ga = rf.getInternalNode(g.id)?.internals.positionAbsolute;
      const gw = g.measured?.width ?? g.width ?? 0;
      const gh = g.measured?.height ?? g.height ?? 0;
      return ga && cx >= ga.x && cx <= ga.x + gw && cy >= ga.y && cy <= ga.y + gh;
    });
    if ((target?.id ?? undefined) === dragged.parentId) return;
    const ga = target ? rf.getInternalNode(target.id)?.internals.positionAbsolute : null;
    setNodes((ns) => ns.map((n) => n.id !== dragged.id ? n : ({
      ...n, parentId: target?.id, position: ga ? { x: abs.x - ga.x, y: abs.y - ga.y } : { x: abs.x, y: abs.y },
    })).sort((a, b) => Number(b.type === "group") - Number(a.type === "group")));
  }, [rf, setNodes]);

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

  return (
    <div className="relative h-[calc(100dvh-210px)] min-h-[560px] overflow-hidden rounded-cc-lg border border-line bg-ivory">
      <div className="cc-atmosphere pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className={cn("absolute inset-y-0 left-0 transition-[right] duration-300", panel ? "right-0 lg:right-[300px]" : "right-0")} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow<BoardNode>
          className="cc-board-flow"
          nodes={nodes}
          onNodesChange={handleNodesChange}
          nodeTypes={nodeTypes}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={() => setViewTick((t) => t + 1)}
          onBeforeDelete={onBeforeDelete}
          defaultViewport={board.content.viewport ?? undefined}
          fitView={fitOnOpen}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={4}
          nodesDraggable={canEdit}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          selectionOnDrag={false}
          panOnScroll
          zoomOnPinch
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#d9d3cc" />
          <MiniMap pannable zoomable className="!rounded-cc !border !border-line !bg-paper/80 !shadow-card max-md:!hidden" maskColor="rgba(247,245,242,0.7)"
            nodeColor={(n) => (n.type === "group" ? "rgba(184,165,255,0.35)" : n.type === "entity" ? "#8064F5" : "#e9e5e1")} />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <p className="cc-display text-3xl">An empty wall.</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {canEdit ? "Drop images here, add notes and links from the toolbar, or drag cultural entities in from the panel on the right." : "Nothing has been added to this board yet."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Top toolbar */}
      <div className="cc-glass absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-1.5 rounded-full p-1.5 lg:right-auto">
        <Button asChild variant="ghost" size="icon-sm" aria-label="All boards"><Link href={`/projects/${board.projectId}/boards`}><ArrowLeft /></Link></Button>
        <input aria-label="Board name" value={name} disabled={!canEdit} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={rename}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-[min(240px,40vw)] truncate rounded-full bg-transparent px-2 py-1 text-[14px] font-medium tracking-tight outline-none focus:bg-paper/80" />
        {canEdit && (
          <>
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
              {uploading > 0 ? <Loader2 className="animate-spin" /> : <ImagePlus />} Image
            </Button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden
              onChange={(e) => { void uploadFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <Button variant="ghost" size="sm" onClick={addNote}><StickyNote /> Note</Button>
            <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}><Link2 /> Link</Button>
            <Button variant="ghost" size="sm" onClick={addGroup}><Frame /> Group</Button>
          </>
        )}
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
        <SaveBadge state={canEdit ? save : "saved"} readOnly={!canEdit} onReload={() => router.refresh()} onRetry={doSave} />
        {canEdit && (
          <Button variant="ghost" size="icon-sm" aria-label="Delete board" onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
        )}
      </div>

      {/* Bottom-left: zoom and palette */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <div className="cc-glass flex items-center gap-0.5 rounded-full p-1">
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => rf.zoomOut()}><Minus /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fit board" onClick={() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 400 })}><Maximize /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => rf.zoomIn()}><Plus /></Button>
        </div>
        {palette.length > 0 && (
          <div className="cc-glass flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5">
            <span className="cc-eyebrow text-muted">Palette</span>
            {palette.map((c) => (
              <button key={c} type="button" title={`Copy ${c}`} aria-label={`Copy colour ${c}`} className="size-6 rounded-full border-2 border-paper shadow-card transition-transform hover:scale-110"
                style={{ background: c }}
                onClick={() => { void navigator.clipboard?.writeText(c); toast({ title: `Copied ${c}`, tone: "success" }); }} />
            ))}
          </div>
        )}
      </div>

      {/* Right: Qloo entities */}
      <Button variant="outline" size="icon-sm" className="absolute right-3 top-3 z-20 shadow-card" aria-label={panel ? "Hide research panel" : "Show research panel"} onClick={() => setPanel((p) => !p)}>
        {panel ? <PanelRightClose /> : <PanelRightOpen />}
      </Button>
      {panel && <EntityPanel entities={entities} canEdit={canEdit} onAdd={(e) => addEntity(e)} projectId={board.projectId} />}

      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} onAdd={(d) => { const p = centre(); add({ type: "link", position: { x: p.x - 130, y: p.y - 80 }, width: 260, height: 170, data: d }); }} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title={`Delete “${board.name}”?`} description="The board, its cards and its uploaded images are removed. Research, evidence and Qloo entities are not affected.">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete board</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveBadge({ state, readOnly, onReload, onRetry }: { state: SaveState; readOnly: boolean; onReload: () => void; onRetry: () => void }) {
  if (readOnly) return <span className="px-2 text-[12px] text-muted">View only</span>;
  if (state === "conflict") return <Button variant="soft" size="sm" onClick={onReload}><CloudOff /> Changed elsewhere · Reload</Button>;
  if (state === "error") return <Button variant="soft" size="sm" onClick={onRetry}><CloudOff /> Not saved · Retry</Button>;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 text-[12px] text-muted" aria-live="polite">
      {state === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
        : state === "dirty" ? <><span className="size-1.5 rounded-full bg-coral" /> Unsaved</>
          : <><Check className="size-3.5 text-violet" /> Saved</>}
    </span>
  );
}

function EntityPanel({ entities, canEdit, onAdd, projectId }: { entities: EntityData[]; canEdit: boolean; onAdd: (e: EntityData) => void; projectId: string }) {
  const [q, setQ] = React.useState("");
  const shown = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? entities.filter((e) => e.name.toLowerCase().includes(t) || (TYPE_LABEL[e.type] ?? e.type).toLowerCase().includes(t)) : entities;
  }, [entities, q]);
  return (
    <aside aria-label="Cultural entities from research" className="absolute inset-y-0 right-0 z-10 flex w-[300px] max-w-[85vw] flex-col border-l border-line bg-paper/95 backdrop-blur-sm">
      <div className="space-y-2 border-b border-line p-3 pr-14">
        <p className="cc-eyebrow flex items-center gap-1.5 text-muted"><Sparkles className="size-3.5 text-violet" /> From research</p>
        <p className="text-[12px] leading-snug text-muted">{canEdit ? "Drag onto the board, or press + to add." : "Qloo entities from the latest run."}</p>
      </div>
      {entities.length === 0 ? (
        <div className="p-4 text-[13px] leading-relaxed text-muted">
          No completed research yet. <Link href={`/projects/${projectId}/research`} className="text-violet-ink hover:underline">Run research</Link> to bring cultural entities onto your boards.
        </div>
      ) : (
        <>
          <label className="relative m-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <span className="sr-only">Filter entities</span>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or type" className="h-9 pl-8 text-[13px]" />
          </label>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {shown.map((e) => (
              <li key={e.entityId}
                draggable={canEdit}
                onDragStart={(ev) => { ev.dataTransfer.setData(ENTITY_MIME, JSON.stringify(e)); ev.dataTransfer.effectAllowed = "copy"; }}
                className={cn("flex items-center gap-2.5 rounded-cc-sm border border-line bg-paper p-1.5", canEdit && "cursor-grab active:cursor-grabbing hover:border-lavender")}>
                <EntityImage src={e.imageUrl} theme={TYPE_THEME[e.type] ?? "culture"} seed={e.entityId} className="size-10 shrink-0 !rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.name}</p>
                  <p className="text-[11px] text-muted">{TYPE_LABEL[e.type] ?? e.type}{e.affinity !== null ? ` · ${e.affinity.toFixed(2)}` : ""}</p>
                </div>
                {canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Add ${e.name} to the board`} onClick={() => onAdd(e)}><Plus /></Button>}
              </li>
            ))}
            {shown.length === 0 && <li className="p-2 text-[12px] text-muted">No entities match “{q}”.</li>}
          </ul>
        </>
      )}
    </aside>
  );
}

function LinkDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (d: { url: string; title: string; note: string }) => void }) {
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const valid = safeUrl(url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onAdd({ url: valid, title: title.trim() || new URL(valid).hostname.replace(/^www\./, ""), note: note.trim() });
    setUrl(""); setTitle(""); setNote("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a reference link" description="An article, post, video or campaign. The link stays clickable on the board.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="URL" htmlFor="link-url" error={url && !valid ? "Enter a web address starting with http:// or https://" : null}>
            <Input id="link-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
          </Field>
          <Field label="Title" htmlFor="link-title" optional>
            <Input id="link-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="What is it?" />
          </Field>
          <Field label="Why it matters" htmlFor="link-note" optional>
            <Textarea id="link-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}>Add link</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
