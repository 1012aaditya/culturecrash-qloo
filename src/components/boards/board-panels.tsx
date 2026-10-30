"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalSpaceAround, ArrowDownToLine, ArrowUpToLine, Check, CloudOff, Copy, ExternalLink, History as HistoryIcon,
  FileCheck2, Loader2, Lock, LockOpen, MessageSquare, Plus, Search, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Ago } from "@/components/ui/time";
import { listBoardVersionsAction, type BoardVersionRow, type CardComment } from "@/lib/boards/actions";
import { colourName, contrastLevel, contrastRatio, readablePairs } from "@/lib/boards/colour";
import type { BoardCritique } from "@/lib/boards/critique";
import { safeUrl, type EntityData, type EvidenceCardData } from "@/lib/boards/schema";
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

export const EVIDENCE_MIME = "application/x-culturecrash-evidence";

const EVIDENCE_KIND: Record<string, string> = { external_source: "Web claim", approved_conclusion: "Conclusion", experiment_result: "Result" };

/** Research to bring onto the board: Qloo entities and cited evidence from this campaign. */
export function ResearchPanel({ entities, evidence, canEdit, onAddEntity, onAddEvidence, projectId, initialTab }: {
  entities: EntityData[]; evidence: EvidenceCardData[]; canEdit: boolean; onAddEntity: (e: EntityData) => void; onAddEvidence: (e: EvidenceCardData) => void; projectId: string;
  initialTab?: "qloo" | "evidence";
}) {
  const [tab, setTab] = React.useState<"qloo" | "evidence">(initialTab ?? (entities.length || !evidence.length ? "qloo" : "evidence"));
  const [q, setQ] = React.useState("");
  const t = q.trim().toLowerCase();
  const shownEntities = t ? entities.filter((e) => e.name.toLowerCase().includes(t) || (TYPE_LABEL[e.type] ?? e.type).toLowerCase().includes(t)) : entities;
  const shownEvidence = t ? evidence.filter((e) => e.claim.toLowerCase().includes(t) || e.source.toLowerCase().includes(t)) : evidence;
  const item = cn("flex items-center gap-2.5 rounded-cc-sm border border-line bg-paper p-1.5", canEdit && "cursor-grab active:cursor-grabbing hover:border-lavender");
  return (
    <aside aria-label="Research for this board" className="absolute inset-y-0 right-0 z-10 flex w-[300px] max-w-[85vw] flex-col border-l border-line bg-paper/95 backdrop-blur-sm">
      <div className="space-y-2 border-b border-line p-3 pr-14">
        <p className="cc-eyebrow flex items-center gap-1.5 text-muted"><Sparkles className="size-3.5 text-violet" /> From research</p>
        <div role="tablist" aria-label="Research sources" className="flex gap-1">
          {([["qloo", `Qloo · ${entities.length}`], ["evidence", `Evidence · ${evidence.length}`]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("rounded-full px-2.5 py-1 text-[12px]", tab === k ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink")}>{label}</button>
          ))}
        </div>
      </div>
      <label className="relative m-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        <span className="sr-only">Filter</span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "qloo" ? "Filter by name or type" : "Filter claims or sources"} className="h-9 pl-8 text-[13px]" />
      </label>
      <ul role="tabpanel" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {tab === "qloo" && (entities.length === 0
          ? <li className="p-1 text-[13px] leading-relaxed text-muted">No completed research yet. <Link href={`/projects/${projectId}/research`} className="text-violet-ink hover:underline">Run research</Link> to bring cultural entities onto your boards.</li>
          : shownEntities.map((e) => (
            <li key={e.entityId} draggable={canEdit} className={item}
              onDragStart={(ev) => { ev.dataTransfer.setData(ENTITY_MIME, JSON.stringify(e)); ev.dataTransfer.effectAllowed = "copy"; }}>
              <EntityImage src={e.imageUrl} theme={TYPE_THEME[e.type] ?? "culture"} seed={e.entityId} className="size-10 shrink-0 !rounded-[8px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{e.name}</p>
                <p className="text-[11px] text-muted">{TYPE_LABEL[e.type] ?? e.type}{e.affinity !== null ? ` · ${e.affinity.toFixed(2)}` : ""}</p>
              </div>
              {canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Add ${e.name} to the board`} onClick={() => onAddEntity(e)}><Plus /></Button>}
            </li>
          )))}
        {tab === "evidence" && (evidence.length === 0
          ? <li className="p-1 text-[13px] leading-relaxed text-muted">No cited web claims, conclusions or results yet. They appear here after research with web sources.</li>
          : shownEvidence.map((e) => (
            <li key={e.evidenceId} draggable={canEdit} className={cn(item, "items-start")}
              onDragStart={(ev) => { ev.dataTransfer.setData(EVIDENCE_MIME, JSON.stringify(e)); ev.dataTransfer.effectAllowed = "copy"; }}>
              <FileCheck2 className="mt-0.5 size-4 shrink-0 text-violet" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-[12.5px] leading-snug">{e.claim}</p>
                <p className="mt-0.5 text-[11px] text-muted">{EVIDENCE_KIND[e.evidenceType] ?? "Evidence"}{e.url ? ` · ${new URL(e.url).hostname.replace(/^www\./, "")}` : e.source ? ` · ${e.source}` : ""}</p>
              </div>
              {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Add this claim to the board" onClick={() => onAddEvidence(e)}><Plus /></Button>}
            </li>
          )))}
        {((tab === "qloo" && entities.length > 0 && shownEntities.length === 0) || (tab === "evidence" && evidence.length > 0 && shownEvidence.length === 0)) && <li className="p-2 text-[12px] text-muted">Nothing matches “{q}”.</li>}
      </ul>
    </aside>
  );
}

/** How many sourceable cards carry a source: a quick read of how traceable the board is. */
export function EvidenceMeter({ sourced, sourceable }: { sourced: number; sourceable: number }) {
  if (!sourceable) return null;
  const pct = Math.round((sourced / sourceable) * 100);
  return (
    <span title="Images, links, Qloo entities and evidence cards with a source. Notes and groups aren’t counted." aria-label={`${sourced} of ${sourceable} cards sourced`}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-medium", pct === 100 ? "bg-lilac/70 text-violet-ink" : pct >= 60 ? "bg-ink/5 text-ink" : "bg-peach/60 text-[#8a3d22]")}>
      <FileCheck2 className="size-3.5" /> {sourced}/{sourceable} sourced
    </span>
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

const TYPE_NAME: Record<string, string> = { image: "Image", note: "Note", link: "Link", entity: "Qloo entity", group: "Group", evidence: "Evidence" };

/** Accessible alternative to the canvas: every card as a table row, with a way to jump to it. */
export function ListView({ nodes, onLocate }: { nodes: BoardNode[]; onLocate: (id: string) => void }) {
  const groups = new Map(nodes.filter((n) => n.type === "group").map((n) => [n.id, String(n.data.label || "Untitled group")]));
  return (
    <div className="absolute inset-0 z-[5] overflow-y-auto bg-ivory/95 px-3 pb-6 pt-6 sm:px-6">
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
            const src = n.type === "image" ? n.data.sourceUrl : n.type === "link" || n.type === "evidence" ? n.data.url : null;
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

/** The board palette with names, WCAG contrast and readable pairs; copies as CSS custom properties. */
export function PaletteDialog({ palette, open, onOpenChange, onCopied }: { palette: string[]; open: boolean; onOpenChange: (o: boolean) => void; onCopied: (what: string) => void }) {
  const pairs = readablePairs(palette).slice(0, 8);
  const css = palette.map((c, i) => `--board-colour-${i + 1}: ${c}; /* ${colourName(c)} */`).join("\n");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Board palette" description="The most common colours across this board’s images. Contrast follows WCAG: AA needs 4.5:1 for body text (3:1 for large text).">
        <ul className="divide-y divide-line">
          {palette.map((c) => {
            const onWhite = contrastRatio(c, "#ffffff");
            const onInk = contrastRatio(c, "#111116");
            return (
              <li key={c} className="flex items-center gap-3 py-2">
                <span className="size-9 shrink-0 rounded-cc-sm border border-line" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{colourName(c)}</p>
                  <p className="font-mono text-[11px] text-muted">{c}</p>
                </div>
                <span className="text-right text-[11px] text-muted">on white {onWhite.toFixed(1)} · {contrastLevel(onWhite)}<br />on black {onInk.toFixed(1)} · {contrastLevel(onInk)}</span>
              </li>
            );
          })}
        </ul>
        {pairs.length > 0 && (
          <div className="mt-4">
            <p className="cc-eyebrow text-muted">Readable text pairs</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pairs.map((p) => (
                <div key={`${p.text}-${p.background}`} className="rounded-cc-sm border border-line p-2 text-center" style={{ background: p.background, color: p.text }}>
                  <p className="text-[18px] font-semibold leading-none">Aa</p>
                  <p className="mt-1 text-[10px] opacity-80">{p.ratio.toFixed(1)} · {p.level}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(palette.join(", ")); onCopied("hex values"); }}>Copy hex values</Button>
          <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(css); onCopied("CSS variables"); }}>Copy as CSS</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AI critique of the board; each point can jump to the cards it is about. */
function CritiquePoints({ title, items, tone, onLocate }: { title: string; items: { cardIds: string[]; point: string }[]; tone: string; onLocate: (ids: string[]) => void }) {
  return items.length ? (
    <div>
      <p className={cn("cc-eyebrow", tone)}>{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((p, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-[13px] leading-relaxed">
            <span>{p.point}</span>
            {p.cardIds.length > 0 && <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onLocate(p.cardIds)}>Show</Button>}
          </li>
        ))}
      </ul>
    </div>
  ) : null;
}

export function CritiqueDialog({ open, onOpenChange, critique, pending, error, onRun, onLocate, onKeep, canEdit }: {
  open: boolean; onOpenChange: (o: boolean) => void; critique: BoardCritique | null; pending: boolean; error: string | null;
  onRun: () => void; onLocate: (ids: string[]) => void; onKeep: () => void; canEdit: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,calc(100vw-24px))]" title="Board critique" description="An AI art-director read of this board against the brief and its linked direction. Fit labels are hypotheses; the team decides.">
        {pending ? <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Reading the board…</p>
          : error ? <div className="space-y-3"><p className="text-[13px] text-danger">{error}</p><Button size="sm" variant="outline" onClick={onRun}>Try again</Button></div>
            : !critique ? <Button onClick={onRun}><Sparkles /> Critique this board</Button> : (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed">{critique.summary}</p>
                <CritiquePoints title="Supports the direction" items={critique.supports} tone="text-violet-ink" onLocate={onLocate} />
                <CritiquePoints title="Off-brief" items={critique.offBrief} tone="text-[#8a3d22]" onLocate={onLocate} />
                {critique.missing.length > 0 && <div><p className="cc-eyebrow text-muted">Missing</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px]">{critique.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
                {critique.nextSteps.length > 0 && <div><p className="cc-eyebrow text-muted">Next steps</p><ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px]">{critique.nextSteps.map((m, i) => <li key={i}>{m}</li>)}</ol></div>}
                <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-[11px] text-muted">{generatorLabelShort(critique.generator)} · <Ago value={critique.at} /></p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={onRun}>Run again</Button>
                    {canEdit && <Button size="sm" variant="outline" onClick={onKeep}>Add as note</Button>}
                  </div>
                </div>
              </div>
            )}
      </DialogContent>
    </Dialog>
  );
}

const generatorLabelShort = (g: string) => (g.startsWith("llm:") ? `AI · ${g.slice(4)}` : g);
