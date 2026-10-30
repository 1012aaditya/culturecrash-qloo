"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalSpaceAround, ArrowDownToLine, ArrowUpToLine, Check, CloudOff, Copy, ExternalLink, History as HistoryIcon,
  Loader2, Lock, LockOpen, MessageSquare, Plus, Search, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Ago } from "@/components/ui/time";
import { listBoardVersionsAction, type BoardVersionRow, type CardComment } from "@/lib/boards/actions";
import { safeUrl, type EntityData } from "@/lib/boards/schema";
import { cn } from "@/lib/utils";
import { describe, type AlignMode, type BoardNode } from "./board-logic";

export const ENTITY_MIME = "application/x-culturecrash-entity";

export type SaveState = "saved" | "dirty" | "saving" | "merging" | "error" | "conflict";

export function SaveBadge({ state, readOnly, onReload, onRetry }: { state: SaveState; readOnly: boolean; onReload: () => void; onRetry: () => void }) {
  if (readOnly) return <span className="px-2 text-[12px] text-muted">View only</span>;
  if (state === "conflict") return <Button variant="soft" size="sm" onClick={onReload}><CloudOff /> Changed elsewhere · Reload</Button>;
  if (state === "error") return <Button variant="soft" size="sm" onClick={onRetry}><CloudOff /> Not saved · Retry</Button>;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 text-[12px] text-muted" aria-live="polite">
      {state === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
        : state === "merging" ? <><Users className="size-3.5 text-violet" /> Merging a teammate’s changes…</>
          : state === "dirty" ? <><span className="size-1.5 rounded-full bg-coral" /> Unsaved</>
            : <><Check className="size-3.5 text-violet" /> Saved</>}
    </span>
  );
}

export function EntityPanel({ entities, canEdit, onAdd, projectId }: { entities: EntityData[]; canEdit: boolean; onAdd: (e: EntityData) => void; projectId: string }) {
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

export function LinkDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (d: { url: string; title: string; note: string }) => void }) {
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const valid = safeUrl(url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onAdd({ url: valid, title: title.trim(), note: note.trim() });
    setUrl(""); setTitle(""); setNote("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a reference link" description="An article, post, video or campaign. The title and preview image are fetched for you; the link stays clickable on the board.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="URL" htmlFor="link-url" error={url && !valid ? "Enter a web address starting with http:// or https://" : null}>
            <Input id="link-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
          </Field>
          <Field label="Title" htmlFor="link-title" optional hint="Leave empty to use the page’s own title.">
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

export function HistoryDialog({ boardId, open, onOpenChange, onRestore, canEdit }: { boardId: string; open: boolean; onOpenChange: (o: boolean) => void; onRestore: (versionId: string) => Promise<void>; canEdit: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Version history" description="A snapshot is kept every 10 minutes of editing (the latest 30). Restoring replaces the board’s cards; undo brings them back.">
        {/* Mounted per opening, so the list is always fetched fresh. */}
        {open && <VersionList boardId={boardId} canEdit={canEdit} onRestore={async (id) => { await onRestore(id); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}

function VersionList({ boardId, canEdit, onRestore }: { boardId: string; canEdit: boolean; onRestore: (versionId: string) => Promise<void> }) {
  const [rows, setRows] = React.useState<BoardVersionRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    void listBoardVersionsAction(boardId).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data ?? []);
      else setError(r.error);
    });
    return () => { live = false; };
  }, [boardId]);
  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!rows) return <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  if (rows.length === 0) return <p className="text-[13px] text-muted">No snapshots yet. One is taken on the first save and then every 10 minutes of editing.</p>;
  return (
    <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
      {rows.map((v, i) => (
        <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium"><Ago value={v.createdAt} />{i === 0 && <span className="ml-2 rounded-full bg-lilac/60 px-1.5 py-0.5 text-[10.5px] text-violet-ink">Latest</span>}</p>
            <p className="text-[12px] text-muted">{v.cardCount} {v.cardCount === 1 ? "card" : "cards"}{v.author ? ` · ${v.author}` : ""}</p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => { setBusy(v.id); await onRestore(v.id); setBusy(null); }}>
              {busy === v.id ? <Loader2 className="animate-spin" /> : <HistoryIcon />} Restore
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const TYPE_NAME: Record<string, string> = { image: "Image", note: "Note", link: "Link", entity: "Qloo entity", group: "Group" };

/** Accessible alternative to the canvas: every card as a table row, with a way to jump to it. */
export function ListView({ nodes, onLocate }: { nodes: BoardNode[]; onLocate: (id: string) => void }) {
  const groups = new Map(nodes.filter((n) => n.type === "group").map((n) => [n.id, String(n.data.label || "Untitled group")]));
  return (
    <div className="absolute inset-0 z-[5] overflow-y-auto bg-ivory/95 px-3 pb-6 pt-20 sm:px-6">
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-cc border border-line bg-paper text-left text-[13px]">
        <caption className="sr-only">Cards on this board</caption>
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">Card</th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">Type</th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">Source</th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">Group</th>
            <th scope="col" className="border-b border-line px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {nodes.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-muted">No cards yet.</td></tr>}
          {nodes.map((n) => {
            const src = n.type === "image" ? n.data.sourceUrl : n.type === "link" ? n.data.url : null;
            return (
              <tr key={n.id} className="align-top">
                <td className="border-b border-line px-3 py-2">{describe(n).replace(/^[^:]+: /, "")}</td>
                <td className="border-b border-line px-3 py-2 text-muted">{TYPE_NAME[n.type ?? ""] ?? n.type}</td>
                <td className="border-b border-line px-3 py-2">
                  {typeof src === "string" && src ? <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-ink hover:underline">{new URL(src).hostname.replace(/^www\./, "")} <ExternalLink className="size-3" /></a>
                    : n.type === "image" ? <span className="text-[#8a3d22]">No source</span> : <span className="text-muted">—</span>}
                </td>
                <td className="border-b border-line px-3 py-2 text-muted">{n.parentId ? groups.get(n.parentId) ?? "—" : "—"}</td>
                <td className="border-b border-line px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => onLocate(n.id)}>Show on board</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ALIGN: { mode: AlignMode; label: string; Icon: React.ComponentType }[] = [
  { mode: "left", label: "Align left edges", Icon: AlignStartVertical },
  { mode: "centre", label: "Align horizontal centres", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right edges", Icon: AlignEndVertical },
  { mode: "top", label: "Align top edges", Icon: AlignStartHorizontal },
  { mode: "middle", label: "Align vertical centres", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom edges", Icon: AlignEndHorizontal },
];

/** Actions for the selected cards. Shown only to editors while something is selected. */
export function SelectionBar({ count, locked, onDuplicate, onLock, onFront, onBack, onAlign, onDistribute, onDelete, onComments }: {
  count: number; locked: boolean; onComments?: () => void; onDuplicate: () => void; onLock: () => void; onFront: () => void; onBack: () => void;
  onAlign: (m: AlignMode) => void; onDistribute: (axis: "x" | "y") => void; onDelete: () => void;
}) {
  return (
    <div role="toolbar" aria-label={`${count} selected`} className="cc-glass absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full p-1">
      <span className="px-2 text-[12px] text-muted">{count} selected</span>
      {count === 1 && onComments && <Button variant="ghost" size="icon-sm" aria-label="Comments" title="Comments" onClick={onComments}><MessageSquare /></Button>}
      <Button variant="ghost" size="icon-sm" aria-label="Duplicate (⌘D)" title="Duplicate (⌘D)" onClick={onDuplicate}><Copy /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={locked ? "Unlock (⇧⌘L)" : "Lock (⇧⌘L)"} title={locked ? "Unlock (⇧⌘L)" : "Lock (⇧⌘L)"} onClick={onLock}>{locked ? <LockOpen /> : <Lock />}</Button>
      <Button variant="ghost" size="icon-sm" aria-label="Bring to front (])" title="Bring to front (])" onClick={onFront}><ArrowUpToLine /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Send to back ([)" title="Send to back ([)" onClick={onBack}><ArrowDownToLine /></Button>
      {count >= 2 && <>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
        {ALIGN.map(({ mode, label, Icon }) => <Button key={mode} variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => onAlign(mode)}><Icon /></Button>)}
      </>}
      {count >= 3 && <>
        <Button variant="ghost" size="icon-sm" aria-label="Distribute horizontally" title="Distribute horizontally" onClick={() => onDistribute("x")}><AlignHorizontalSpaceAround /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Distribute vertically" title="Distribute vertically" onClick={() => onDistribute("y")}><AlignVerticalSpaceAround /></Button>
      </>}
      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
      <Button variant="ghost" size="icon-sm" aria-label="Delete (⌫)" title="Delete (⌫)" onClick={onDelete}><Trash2 /></Button>
    </div>
  );
}

/** Discussion thread for one card. Posting needs comment rights; everyone in the workspace can read. */
export function CommentsPanel({ cardLabel, comments, canComment, onPost, onClose }: {
  cardLabel: string; comments: CardComment[]; canComment: boolean; onPost: (body: string) => Promise<string | null>; onClose: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <aside aria-label="Card comments" className="absolute inset-y-0 right-0 z-30 flex w-[320px] max-w-[90vw] flex-col border-l border-line bg-paper shadow-float">
      <div className="flex items-start justify-between gap-2 border-b border-line p-3">
        <div className="min-w-0">
          <p className="cc-eyebrow flex items-center gap-1.5 text-muted"><MessageSquare className="size-3.5 text-violet" /> Comments</p>
          <p className="mt-1 truncate text-[13px] font-medium">{cardLabel}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close comments" onClick={onClose}><X /></Button>
      </div>
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {comments.length === 0 && <li className="text-[13px] text-muted">No comments on this card yet.</li>}
        {comments.map((c) => (
          <li key={c.id} className="rounded-cc-sm border border-line bg-ivory/60 p-2.5">
            <p className="text-[12px] text-muted"><span className="font-medium text-ink">{c.author}</span> · <Ago value={c.createdAt} /></p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
          </li>
        ))}
      </ol>
      {canComment && (
        <form className="space-y-2 border-t border-line p-3" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const err = await onPost(body);
            setError(err);
            if (!err) setBody("");
          });
        }}>
          <label htmlFor="card-comment" className="sr-only">Add a comment</label>
          <Textarea id="card-comment" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Why does this belong on the board?" />
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end"><Button size="sm" type="submit" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Comment"}</Button></div>
        </form>
      )}
    </aside>
  );
}
