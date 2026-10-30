"use client";

import Link from "next/link";
import * as React from "react";
import { NodeResizer, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, ArrowUpRight, Bookmark, Copy, Heart, MessageCircle, MoreHorizontal, Play, Send, Smartphone, ExternalLink, FileCheck2, Link2, Loader2, Lock, MessageSquare, Route, ScanEye, Sparkles, Wand2 } from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import type { EntityData, EvidenceCardData, GroupData, ImageData, ImageFitData, ImageRights, LinkData, MockupData, NoteData } from "@/lib/boards/schema";
import { safeUrl } from "@/lib/boards/schema";
import { cn } from "@/lib/utils";

/** Board-level context the cards need: edit rights and where links resolve. */
export type BoardContext = {
  canEdit: boolean; projectId: string; onMediaError: () => void;
  /** Comment count per card id, and opening a card's thread. */
  commentCounts: Record<string, number>; openComments: (cardId: string) => void;
  /** Cultural-fit check for an image card, and the cards currently being checked. */
  checkFit: (cardId: string) => void; fitPending: ReadonlySet<string>;
  /** Presentation mode: no editing chrome; reference-only images are watermarked. */
  presenting: boolean;
  /** AI variations of an image card (null when no GPU PC is set up for this server). */
  makeVariations: ((cardId: string) => void) | null;
  /** Shows an image card as touchpoint mockups (post, story, playlist, billboard). */
  makeMockups: (cardId: string) => void;
  /** The art-director loop for weak AI frames, and the cards being improved. */
  improve: ((cardId: string) => void) | null; improvePending: ReadonlySet<string>;
  /** Opens an AI concept's evidence trail. */
  openTrail: (cardId: string) => void;
};
export const BoardCtx = React.createContext<BoardContext>({ canEdit: false, projectId: "", onMediaError: () => {}, commentCounts: {}, openComments: () => {}, checkFit: () => {}, fitPending: new Set(), presenting: false, makeVariations: null, makeMockups: () => {}, improve: null, improvePending: new Set(), openTrail: () => {} });

/** Comment count on a card; opens the card's thread. */
function CommentBadge({ id }: { id: string }) {
  const { commentCounts, openComments, presenting } = React.useContext(BoardCtx);
  const n = commentCounts[id] ?? 0;
  if (!n || presenting) return null;
  return (
    <button type="button" onClick={() => openComments(id)} aria-label={`${n} ${n === 1 ? "comment" : "comments"}`}
      className="nodrag absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-violet px-1.5 py-0.5 text-[10.5px] font-medium text-white shadow-card hover:bg-violet-ink">
      <MessageSquare className="size-3" /> {n}
    </button>
  );
}

/** Small badge on locked cards; locked cards can't be moved, resized or deleted until unlocked. */
function LockBadge({ locked }: { locked?: boolean }) {
  if (!locked) return null;
  return <span title="Locked" className="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-ink/70 text-white"><Lock className="size-3" /></span>;
}

const VIOLET = "#8064F5";
const card = "h-full w-full overflow-hidden rounded-cc border bg-paper shadow-card transition-shadow";
const ring = (selected: boolean) => (selected ? "border-violet shadow-[0_0_0_3px_rgba(128,100,245,0.22)]" : "border-line");

function Resizer({ selected, locked, minWidth = 140, minHeight = 80, keepAspectRatio }: { selected: boolean; locked?: boolean; minWidth?: number; minHeight?: number; keepAspectRatio?: boolean }) {
  const { canEdit } = React.useContext(BoardCtx);
  return (
    <NodeResizer
      isVisible={selected && canEdit && !locked}
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      color={VIOLET}
      handleClassName="!size-2.5 !rounded-full !border-2 !border-paper"
      lineClassName="!border-violet/40"
    />
  );
}

/** Inline text that edits in place without dragging the card. */
function InlineText({ value, onChange, placeholder, className, multiline }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; multiline?: boolean }) {
  const { canEdit } = React.useContext(BoardCtx);
  const shared = cn("nodrag nowheel w-full resize-none bg-transparent outline-none placeholder:text-muted/70 focus:bg-ink/[0.03] rounded-[6px]", className);
  if (!canEdit) return value ? <p className={cn(className, "whitespace-pre-wrap")}>{value}</p> : null;
  return multiline
    ? <textarea aria-label={placeholder} className={cn(shared, "h-full")} value={value} placeholder={placeholder} maxLength={4000} onChange={(e) => onChange(e.target.value)} />
    : <input aria-label={placeholder} className={shared} value={value} placeholder={placeholder} maxLength={200} onChange={(e) => onChange(e.target.value)} />;
}

function useUpdate(id: string) {
  const { updateNodeData } = useReactFlow();
  return React.useCallback((patch: Record<string, unknown>) => updateNodeData(id, patch), [id, updateNodeData]);
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const FIT_STYLE: Record<ImageFitData["level"], string> = {
  strong: "bg-violet text-white", partial: "bg-lilac text-violet-ink", off: "bg-coral/80 text-ink", unknown: "bg-ink/5 text-muted",
};

/** AI-assessed fit with the audience's Qloo taste tags; the tooltip carries the reasoning and descriptors. */
function FitChip({ fit }: { fit: ImageFitData }) {
  const label = fit.level === "strong" ? `Fits: ${fit.tags.slice(0, 2).join(", ")}`
    : fit.level === "partial" ? (fit.tags.length ? `Partly fits: ${fit.tags[0]}` : "Partly fits")
      : fit.level === "off" ? "Off-audience" : fit.descriptors.slice(0, 2).join(" · ") || "No taste tags to compare";
  return (
    <span title={`${fit.rationale}\nLooks: ${fit.descriptors.join(", ")}\nAI assessment (${fit.model}), not evidence.`}
      className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10.5px] font-medium", FIT_STYLE[fit.level])}>
      <ScanEye className="size-3 shrink-0" /> <span className="truncate">{label}</span>
    </span>
  );
}

const RIGHTS_LABEL: Record<ImageRights, string> = { reference: "Reference only · not for publication", licensed: "Licensed", own: "Own asset", ai: "AI concept · not final artwork" };

const IMPROVED_FROM: Record<string, string> = { partial: "partial fit", off: "off-taste", strong: "strong fit", unknown: "not judged" };

export function ImageNode({ id, data, selected, width }: NodeProps<Node<ImageData>>) {
  const update = useUpdate(id);
  const { canEdit, onMediaError, checkFit, fitPending, presenting, makeVariations, makeMockups, improve, improvePending, openTrail } = React.useContext(BoardCtx);
  const rights = data.rights ?? "reference";
  const zoom = useStore((st) => st.transform[2]);
  const [editingSource, setEditingSource] = React.useState(false);
  const [draft, setDraft] = React.useState(data.sourceUrl ?? "");
  // The thumbnail is enough until the card is shown wider than it on screen.
  const src = (width ?? 260) * zoom > 600 ? data.url ?? data.thumbUrl : data.thumbUrl ?? data.url;
  const saveSource = () => {
    update({ sourceUrl: safeUrl(draft) });
    setEditingSource(false);
  };
  return (
    <>
      <Resizer selected={selected} locked={data.locked} keepAspectRatio />
      <figure data-presence-field={`card-${id}`} className={cn(card, ring(selected), "relative flex flex-col")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        <div className="relative min-h-0 flex-1 bg-ivory">
          {src
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
            ? <img src={src} alt={data.alt || data.title || "Reference image"} draggable={false} loading="lazy" decoding="async" onError={onMediaError} className={cn("h-full w-full object-cover", rights === "ai" && "cc-develop")} />
            : <div className="flex h-full items-center justify-center text-[12px] text-muted">Image unavailable</div>}
          {presenting && (rights === "reference" || rights === "ai") && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-charcoal/70 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wider text-white">{RIGHTS_LABEL[rights]}</span>
          )}
        </div>
        <figcaption className="space-y-1 border-t border-line px-2.5 py-2">
          <InlineText value={data.title} onChange={(v) => update({ title: v })} placeholder="Caption" className="text-[12px] font-medium" />
          {selected && canEdit && (
            <InlineText value={data.alt ?? ""} onChange={(v) => update({ alt: v })} placeholder="Alt text: describe the image" className="text-[11px] text-muted" />
          )}
          <div className="flex items-center justify-between gap-2">
            {editingSource ? (
              <form className="nodrag flex w-full gap-1" onSubmit={(e) => { e.preventDefault(); saveSource(); }}>
                <input autoFocus aria-label="Source URL" className="min-w-0 flex-1 rounded-[6px] border border-line px-1.5 py-0.5 text-[11px] outline-none focus:border-violet" value={draft} placeholder="https://…" onChange={(e) => setDraft(e.target.value)} onBlur={saveSource} />
              </form>
            ) : data.sourceUrl ? (
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="nodrag flex min-w-0 items-center gap-1 text-[11px] text-violet-ink hover:underline">
                <ExternalLink className="size-3 shrink-0" /><span className="truncate">{host(data.sourceUrl)}</span>
              </a>
            ) : !presenting && rights !== "ai" && (
              <button type="button" disabled={!canEdit} onClick={() => setEditingSource(true)} className="nodrag flex items-center gap-1 rounded-full bg-peach/50 px-1.5 py-0.5 text-[10.5px] text-[#8a3d22] enabled:hover:bg-peach">
                <AlertTriangle className="size-3" /> {canEdit ? "Add source" : "No source"}
              </button>
            )}
            {data.sourceUrl && canEdit && !editingSource && (
              <button type="button" onClick={() => { setDraft(data.sourceUrl ?? ""); setEditingSource(true); }} className="nodrag shrink-0 text-[10.5px] text-muted hover:text-ink">Edit</button>
            )}
          </div>
          {selected && canEdit && !presenting ? (
            <select aria-label="Image rights" value={rights} onChange={(e) => update({ rights: e.target.value as ImageRights })}
              className="nodrag h-6 rounded-full border border-line bg-paper px-1.5 text-[10.5px] outline-none focus:border-violet">
              <option value="reference">Reference only</option>
              <option value="licensed">Licensed</option>
              <option value="own">Own asset</option>
              <option value="ai">AI concept</option>
            </select>
          ) : rights !== "reference" && <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10.5px]", rights === "ai" ? "bg-lilac/60 text-violet-ink" : "bg-ink/5 text-muted")}>{rights === "ai" ? "AI concept · not final" : RIGHTS_LABEL[rights]}</span>}
          {selected && canEdit && !presenting && makeVariations && data.path && (
            <button type="button" onClick={() => makeVariations(id)} className="nodrag ml-1 inline-flex items-center gap-1 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink hover:bg-ink/10">
              <Copy className="size-3" /> Variations
            </button>
          )}
          {selected && canEdit && !presenting && data.path && (
            <button type="button" onClick={() => makeMockups(id)} className="nodrag ml-1 inline-flex items-center gap-1 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink hover:bg-ink/10">
              <Smartphone className="size-3" /> Mockups
            </button>
          )}
          {data.fit ? !presenting && <FitChip fit={data.fit} /> : selected && canEdit && data.thumbPath && (
            <button type="button" onClick={() => checkFit(id)} disabled={fitPending.has(id)} className="nodrag inline-flex items-center gap-1 rounded-full bg-lilac/60 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-ink enabled:hover:bg-lilac">
              {fitPending.has(id) ? <Loader2 className="size-3 animate-spin" /> : <ScanEye className="size-3" />} Check cultural fit
            </button>
          )}
          {!presenting && (data.conceptJobId || data.improvedFrom) && (
            <div className="flex flex-wrap items-center gap-1">
              {data.improvedFrom && data.fit && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] text-muted">
                  <ArrowUpRight className="size-3" /> was {IMPROVED_FROM[data.improvedFrom] ?? data.improvedFrom}
                </span>
              )}
              {data.conceptJobId && (
                <button type="button" onClick={() => openTrail(id)} className="nodrag inline-flex items-center gap-1 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink hover:bg-ink/10">
                  <Route className="size-3" /> Why this image
                </button>
              )}
              {improve && canEdit && data.thumbPath && (data.fit?.level === "partial" || data.fit?.level === "off") && (
                <button type="button" onClick={() => improve(id)} disabled={improvePending.has(id)} className="nodrag inline-flex items-center gap-1 rounded-full bg-violet px-1.5 py-0.5 text-[10.5px] font-medium text-white enabled:hover:bg-violet-ink disabled:opacity-70">
                  {improvePending.has(id) ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />} Make it fit better
                </button>
              )}
            </div>
          )}
          {data.palette.length > 0 && (
            <div className="flex gap-1 pt-0.5" aria-label={`Colours: ${data.palette.join(", ")}`}>
              {data.palette.map((c) => <span key={c} title={c} className="h-2.5 flex-1 rounded-full" style={{ background: c }} />)}
            </div>
          )}
        </figcaption>
      </figure>
    </>
  );
}

const NOTE_TONES: Record<NoteData["tone"], string> = { paper: "bg-paper", lilac: "bg-lilac/70", peach: "bg-peach/60" };

export function NoteNode({ id, data, selected }: NodeProps<Node<NoteData>>) {
  const update = useUpdate(id);
  const { canEdit } = React.useContext(BoardCtx);
  return (
    <>
      <Resizer selected={selected} locked={data.locked} minHeight={60} />
      <div data-presence-field={`card-${id}`} className={cn(card, ring(selected), NOTE_TONES[data.tone], "relative flex flex-col p-3")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        <InlineText multiline value={data.text} onChange={(v) => update({ text: v })} placeholder="Write a note…" className="flex-1 text-[13px] leading-relaxed" />
        {selected && canEdit && (
          <div className="nodrag mt-1 flex gap-1" role="group" aria-label="Note colour">
            {(Object.keys(NOTE_TONES) as NoteData["tone"][]).map((t) => (
              <button key={t} type="button" aria-label={`${t} note`} aria-pressed={data.tone === t} onClick={() => update({ tone: t })}
                className={cn("size-4 rounded-full border", NOTE_TONES[t], data.tone === t ? "border-violet" : "border-line-strong")} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function LinkNode({ id, data, selected }: NodeProps<Node<LinkData>>) {
  const update = useUpdate(id);
  const { onMediaError } = React.useContext(BoardCtx);
  return (
    <>
      <Resizer selected={selected} locked={data.locked} minHeight={90} />
      <div data-presence-field={`card-${id}`} className={cn(card, ring(selected), "relative flex flex-col")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        {data.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview stored in the board's private bucket
          <img src={data.previewUrl} alt="" loading="lazy" onError={onMediaError} className="h-28 w-full shrink-0 border-b border-line object-cover" />
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] text-muted"><Link2 className="size-3.5 text-violet" /> <span className="truncate">{data.siteName || (data.url ? host(data.url) : "No link")}</span></p>
          <InlineText value={data.title} onChange={(v) => update({ title: v })} placeholder="Title" className="text-[14px] font-medium tracking-tight" />
          <InlineText multiline value={data.note} onChange={(v) => update({ note: v })} placeholder="Why it matters" className="min-h-0 flex-1 text-[12px] text-muted" />
          {data.url && (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="nodrag inline-flex w-fit items-center gap-1 rounded-full bg-lilac/60 px-2 py-0.5 text-[11px] font-medium text-violet-ink hover:bg-lilac">
              Open source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </>
  );
}

export function EntityNode({ id, data, selected }: NodeProps<Node<EntityData>>) {
  const { projectId } = React.useContext(BoardCtx);
  const theme = TYPE_THEME[data.type] ?? "culture";
  return (
    <>
      <Resizer selected={selected} locked={data.locked} minWidth={160} minHeight={150} />
      <div data-presence-field={`card-${id}`} className={cn(card, ring(selected), "relative flex flex-col")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        <EntityImage src={data.imageUrl} theme={theme} seed={data.entityId || data.name} rounded={false} className="min-h-0 flex-1" />
        <div className="space-y-1 border-t border-line px-2.5 py-2">
          <p className="truncate text-[13px] font-medium tracking-tight">{data.name}</p>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><Sparkles className="size-3 text-violet" /> Qloo · {TYPE_LABEL[data.type] ?? data.type}</span>
            {data.affinity !== null && <span className="font-mono">{data.affinity.toFixed(2)}</span>}
          </div>
          {data.evidenceId && (
            <Link href={`/projects/${projectId}/evidence/${data.evidenceId}`} className="nodrag text-[11px] text-violet-ink hover:underline">View evidence</Link>
          )}
        </div>
      </div>
    </>
  );
}

export function GroupNode({ id, data, selected }: NodeProps<Node<GroupData>>) {
  const update = useUpdate(id);
  return (
    <>
      <Resizer selected={selected} locked={data.locked} minWidth={220} minHeight={160} />
      <div data-presence-field={`card-${id}`} className={cn("relative h-full w-full rounded-cc-lg border-2 border-dashed bg-lilac/15", selected ? "border-violet" : "border-lavender/70")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        <div className="-translate-y-full px-1 pb-1">
          <InlineText value={data.label} onChange={(v) => update({ label: v })} placeholder="Group name" className="cc-eyebrow w-64 text-violet-ink" />
        </div>
      </div>
    </>
  );
}

const EVIDENCE_LABEL: Record<string, string> = { external_source: "Web claim", approved_conclusion: "Approved conclusion", experiment_result: "Experiment result" };

export function EvidenceNode({ id, data, selected }: NodeProps<Node<EvidenceCardData>>) {
  const { projectId } = React.useContext(BoardCtx);
  return (
    <>
      <Resizer selected={selected} locked={data.locked} minWidth={200} minHeight={120} />
      <div data-presence-field={`card-${id}`} className={cn(card, ring(selected), "relative flex flex-col gap-2 border-l-4 !border-l-violet p-3")}>
        <LockBadge locked={data.locked} /><CommentBadge id={id} />
        <p className="flex items-center gap-1.5 text-[11px] text-muted"><FileCheck2 className="size-3.5 text-violet" /> {EVIDENCE_LABEL[data.evidenceType] ?? "Evidence"}{data.score !== null ? ` · quality ${data.score.toFixed(2)}` : ""}</p>
        <p className="nowheel min-h-0 flex-1 overflow-y-auto text-[13px] leading-relaxed">{data.claim}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {data.url && <a href={data.url} target="_blank" rel="noopener noreferrer" className="nodrag inline-flex items-center gap-1 text-violet-ink hover:underline">{host(data.url)} <ExternalLink className="size-3" /></a>}
          <Link href={`/projects/${projectId}/evidence/${data.evidenceId}`} className="nodrag text-muted hover:text-ink hover:underline">View evidence</Link>
        </div>
      </div>
    </>
  );
}

/**
 * A touchpoint mockup: the frame and headline shown the way people would meet them. Formats are generic
 * (no platform logos or trademarks); a small chip keeps it honest that this is an AI concept mockup.
 */
export function MockupNode({ data, selected }: NodeProps<Node<MockupData>>) {
  const { onMediaError } = React.useContext(BoardCtx);
  const accent = data.accent ?? "#8064f5";
  const handle = (data.brand || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "");
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
  const img = (cls: string) => data.thumbUrl || data.url ? <img src={data.thumbUrl ?? data.url} alt={data.headline || "Concept frame"} draggable={false} loading="lazy" decoding="async" onError={onMediaError} className={cn("object-cover", cls)} /> : <div className={cn("bg-ivory", cls)} />;
  const chip = <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">Mockup · AI concept</span>;
  const shell = cn("relative h-full w-full overflow-hidden shadow-card transition-shadow", selected && "shadow-[0_0_0_3px_rgba(128,100,245,0.35)]");
  return (
    <>
      <Resizer selected={selected} locked={data.locked} keepAspectRatio />
      {data.format === "post" && (
        <div className={cn(shell, "flex flex-col rounded-[14px] border border-line bg-white text-[#111]")}>
          {chip}
          <div className="flex items-center gap-2 px-2.5 py-2">
            <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: accent }}>{handle.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[12px] font-semibold">{handle}</span><span className="text-[10px] text-[#777]">Sponsored</span></span>
            <MoreHorizontal className="size-4 text-[#777]" />
          </div>
          {img("aspect-square w-full min-h-0 flex-1")}
          <div className="flex items-center gap-3 px-2.5 pt-2 text-[#222]"><Heart className="size-4" /><MessageCircle className="size-4" /><Send className="size-4" /><Bookmark className="ml-auto size-4" /></div>
          <p className="line-clamp-2 px-2.5 pb-2.5 pt-1 text-[11.5px] leading-snug"><span className="font-semibold">{handle}</span> {data.headline}{data.line ? ` ${data.line}` : ""}</p>
        </div>
      )}
      {data.format === "story" && (
        <div className={cn(shell, "rounded-[22px] bg-black")}>
          {img("absolute inset-0 h-full w-full")}
          <div className="absolute inset-x-2 top-2 flex gap-1">{[1, 0, 0].map((f, i) => <span key={i} className={cn("h-0.5 flex-1 rounded-full", f ? "bg-white" : "bg-white/40")} />)}</div>
          <div className="absolute left-2.5 top-4 flex items-center gap-1.5 text-white">
            <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: accent }}>{handle.slice(0, 1).toUpperCase()}</span>
            <span className="text-[11px] font-semibold drop-shadow">{handle}</span><span className="text-[10px] text-white/80">Sponsored</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-16 text-white">
            <p className="cc-display text-[19px] leading-[1.05]">{data.headline}</p>
            {data.line && <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/85">{data.line}</p>}
            <span className="mt-2.5 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold" style={{ color: accent }}>Learn more</span>
          </div>
          <span className="pointer-events-none absolute right-2 top-10 z-10 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">Mockup · AI concept</span>
        </div>
      )}
      {data.format === "playlist" && (
        <div className={cn(shell, "flex flex-col rounded-[14px] bg-[#141414] p-2.5 text-white")}>
          {chip}
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]">
            {img("absolute inset-0 h-full w-full")}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <p className="absolute bottom-2 left-2.5 right-2.5 cc-display text-[22px] leading-[1.02]">{data.headline}</p>
            <span className="absolute left-2.5 top-2 text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>{data.brand || "Playlist"}</span>
          </div>
          <div className="flex items-center gap-2 pt-2.5">
            <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[12px] font-semibold">{data.headline}</span><span className="text-[10.5px] text-white/60">Playlist · made for you by {data.brand || "the brand"}</span></span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: accent }}><Play className="ml-0.5 size-3.5 fill-white text-white" /></span>
          </div>
        </div>
      )}
      {data.format === "billboard" && (
        <div className={cn(shell, "rounded-[12px] bg-gradient-to-b from-[#f4c9a6] via-[#d7a7b4] to-[#6f6a9e]")}>
          {chip}
          <div className="absolute inset-x-0 bottom-0 h-[16%] bg-[#2b2836]" />
          <div className="absolute bottom-[16%] left-[22%] h-[22%] w-[2.5%] bg-[#2b2836]" /><div className="absolute bottom-[16%] right-[22%] h-[22%] w-[2.5%] bg-[#2b2836]" />
          <div className="absolute left-[6%] right-[6%] top-[9%] flex h-[56%] overflow-hidden rounded-[3px] border-[5px] border-[#2b2836] bg-white shadow-lg">
            {img("h-full w-[62%]")}
            <div className="flex flex-1 flex-col justify-center gap-1.5 px-3" style={{ background: accent }}>
              <p className="cc-display text-[18px] leading-[1.02] text-white">{data.headline}</p>
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/85">{data.brand}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const nodeTypes = { image: ImageNode, note: NoteNode, link: LinkNode, entity: EntityNode, group: GroupNode, evidence: EvidenceNode, mockup: MockupNode };
