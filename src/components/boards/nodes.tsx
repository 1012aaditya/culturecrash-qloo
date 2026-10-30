"use client";

import Link from "next/link";
import * as React from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, ExternalLink, Link2, Sparkles } from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import type { EntityData, GroupData, ImageData, LinkData, NoteData } from "@/lib/boards/schema";
import { safeUrl } from "@/lib/boards/schema";
import { cn } from "@/lib/utils";

/** Board-level context the cards need: edit rights and where links resolve. */
export const BoardCtx = React.createContext<{ canEdit: boolean; projectId: string }>({ canEdit: false, projectId: "" });

const VIOLET = "#8064F5";
const card = "h-full w-full overflow-hidden rounded-cc border bg-paper shadow-card transition-shadow";
const ring = (selected: boolean) => (selected ? "border-violet shadow-[0_0_0_3px_rgba(128,100,245,0.22)]" : "border-line");

function Resizer({ selected, minWidth = 140, minHeight = 80, keepAspectRatio }: { selected: boolean; minWidth?: number; minHeight?: number; keepAspectRatio?: boolean }) {
  const { canEdit } = React.useContext(BoardCtx);
  return (
    <NodeResizer
      isVisible={selected && canEdit}
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

export function ImageNode({ id, data, selected }: NodeProps<Node<ImageData>>) {
  const update = useUpdate(id);
  const { canEdit } = React.useContext(BoardCtx);
  const [editingSource, setEditingSource] = React.useState(false);
  const [draft, setDraft] = React.useState(data.sourceUrl ?? "");
  const saveSource = () => {
    const url = safeUrl(draft);
    update({ sourceUrl: url });
    setEditingSource(false);
  };
  return (
    <>
      <Resizer selected={selected} keepAspectRatio />
      <figure className={cn(card, ring(selected), "flex flex-col")}>
        <div className="relative min-h-0 flex-1 bg-ivory">
          {data.url
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
            ? <img src={data.url} alt={data.title || "Reference image"} draggable={false} className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center text-[12px] text-muted">Image unavailable</div>}
        </div>
        <figcaption className="space-y-1 border-t border-line px-2.5 py-2">
          <InlineText value={data.title} onChange={(v) => update({ title: v })} placeholder="Caption" className="text-[12px] font-medium" />
          <div className="flex items-center justify-between gap-2">
            {editingSource ? (
              <form className="nodrag flex w-full gap-1" onSubmit={(e) => { e.preventDefault(); saveSource(); }}>
                <input autoFocus aria-label="Source URL" className="min-w-0 flex-1 rounded-[6px] border border-line px-1.5 py-0.5 text-[11px] outline-none focus:border-violet" value={draft} placeholder="https://…" onChange={(e) => setDraft(e.target.value)} onBlur={saveSource} />
              </form>
            ) : data.sourceUrl ? (
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="nodrag flex min-w-0 items-center gap-1 text-[11px] text-violet-ink hover:underline">
                <ExternalLink className="size-3 shrink-0" /><span className="truncate">{host(data.sourceUrl)}</span>
              </a>
            ) : (
              <button type="button" disabled={!canEdit} onClick={() => setEditingSource(true)} className="nodrag flex items-center gap-1 rounded-full bg-peach/50 px-1.5 py-0.5 text-[10.5px] text-[#8a3d22] enabled:hover:bg-peach">
                <AlertTriangle className="size-3" /> {canEdit ? "Add source" : "No source"}
              </button>
            )}
            {data.sourceUrl && canEdit && !editingSource && (
              <button type="button" onClick={() => { setDraft(data.sourceUrl ?? ""); setEditingSource(true); }} className="nodrag shrink-0 text-[10.5px] text-muted hover:text-ink">Edit</button>
            )}
          </div>
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
      <Resizer selected={selected} minHeight={60} />
      <div className={cn(card, ring(selected), NOTE_TONES[data.tone], "flex flex-col p-3")}>
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
  return (
    <>
      <Resizer selected={selected} minHeight={90} />
      <div className={cn(card, ring(selected), "flex flex-col gap-1.5 p-3")}>
        <p className="flex items-center gap-1.5 text-[11px] text-muted"><Link2 className="size-3.5 text-violet" /> {data.url ? host(data.url) : "No link"}</p>
        <InlineText value={data.title} onChange={(v) => update({ title: v })} placeholder="Title" className="text-[14px] font-medium tracking-tight" />
        <InlineText multiline value={data.note} onChange={(v) => update({ note: v })} placeholder="Why it matters" className="min-h-0 flex-1 text-[12px] text-muted" />
        {data.url && (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="nodrag inline-flex w-fit items-center gap-1 rounded-full bg-lilac/60 px-2 py-0.5 text-[11px] font-medium text-violet-ink hover:bg-lilac">
            Open source <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </>
  );
}

export function EntityNode({ data, selected }: NodeProps<Node<EntityData>>) {
  const { projectId } = React.useContext(BoardCtx);
  const theme = TYPE_THEME[data.type] ?? "culture";
  return (
    <>
      <Resizer selected={selected} minWidth={160} minHeight={150} />
      <div className={cn(card, ring(selected), "flex flex-col")}>
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
      <Resizer selected={selected} minWidth={220} minHeight={160} />
      <div className={cn("h-full w-full rounded-cc-lg border-2 border-dashed bg-lilac/15", selected ? "border-violet" : "border-lavender/70")}>
        <div className="-translate-y-full px-1 pb-1">
          <InlineText value={data.label} onChange={(v) => update({ label: v })} placeholder="Group name" className="cc-eyebrow w-64 text-violet-ink" />
        </div>
      </div>
    </>
  );
}

export const nodeTypes = { image: ImageNode, note: NoteNode, link: LinkNode, entity: EntityNode, group: GroupNode };
