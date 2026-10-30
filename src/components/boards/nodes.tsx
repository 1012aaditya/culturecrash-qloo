"use client";

import Link from "next/link";
import * as React from "react";
import { NodeResizer, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, ExternalLink, FileCheck2, Link2, Loader2, Lock, MessageSquare, ScanEye, Sparkles } from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import type { EntityData, EvidenceCardData, GroupData, ImageData, ImageFitData, ImageRights, LinkData, NoteData } from "@/lib/boards/schema";
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
};
export const BoardCtx = React.createContext<BoardContext>({ canEdit: false, projectId: "", onMediaError: () => {}, commentCounts: {}, openComments: () => {}, checkFit: () => {}, fitPending: new Set(), presenting: false });

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

export function ImageNode({ id, data, selected, width }: NodeProps<Node<ImageData>>) {
  const update = useUpdate(id);
  const { canEdit, onMediaError, checkFit, fitPending, presenting } = React.useContext(BoardCtx);
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
            ? <img src={src} alt={data.alt || data.title || "Reference image"} draggable={false} loading="lazy" decoding="async" onError={onMediaError} className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center text-[12px] text-muted">Image unavailable</div>}
          {presenting && rights === "reference" && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-charcoal/70 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wider text-white">Reference only · not for publication</span>
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
            ) : !presenting && (
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
            </select>
          ) : rights !== "reference" && <span className="inline-flex rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] text-muted">{rights === "own" ? "Own asset" : "Licensed"}</span>}
          {data.fit ? !presenting && <FitChip fit={data.fit} /> : selected && canEdit && data.thumbPath && (
            <button type="button" onClick={() => checkFit(id)} disabled={fitPending.has(id)} className="nodrag inline-flex items-center gap-1 rounded-full bg-lilac/60 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-ink enabled:hover:bg-lilac">
              {fitPending.has(id) ? <Loader2 className="size-3 animate-spin" /> : <ScanEye className="size-3" />} Check cultural fit
            </button>
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

export const nodeTypes = { image: ImageNode, note: NoteNode, link: LinkNode, entity: EntityNode, group: GroupNode, evidence: EvidenceNode };
