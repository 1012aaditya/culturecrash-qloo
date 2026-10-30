"use client";

import * as React from "react";
import {
  AlertTriangle, Check, CircleCheck, ExternalLink, FileCheck2, ImagePlus, Link2, Loader2, MapPin, Plus, ScanEye, Sparkles, StickyNote, ThumbsDown, ThumbsUp, Trash2, X,
} from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { colourName } from "@/lib/boards/colour";
import { IMAGE_RIGHTS, safeUrl, type ImageFitData, type ImageRights } from "@/lib/boards/schema";
import { namedIn } from "@/lib/boards/layout";
import { boardSections, type DirectionBrief, type HealthCheck, type NoteRole, type SectionNode } from "@/lib/boards/sections";
import { cn } from "@/lib/utils";

export type BoardViewProps = {
  nodes: SectionNode[];
  direction: DirectionBrief | null;
  checks: HealthCheck[];
  canEdit: boolean;
  uploading: number;
  fitPending: ReadonlySet<string>;
  onUpload: () => void;
  onAddNote: (role: NoteRole) => void;
  onAddLink: () => void;
  onOpenResearch: (tab: "qloo" | "evidence") => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onShowOnCanvas: (id: string) => void;
  onCheckFit: (id: string) => void;
  onPalette: () => void;
  onCopy: (hex: string) => void;
  onMediaError: () => void;
  linkControl: React.ReactNode;
};

const RIGHTS_LABEL: Record<ImageRights, string> = { reference: "Found reference", licensed: "Licensed", own: "Our own asset" };
const host = (url: unknown) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * The board as a creative-direction document. Reads the same cards as the canvas and edits them in place,
 * so nothing here is a copy: removing an image here removes it from the canvas too.
 */
export function BoardView(props: BoardViewProps) {
  const { nodes, direction, checks, canEdit } = props;
  const s = React.useMemo(() => boardSections(nodes), [nodes]);
  const [imageId, setImageId] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState<ReadonlySet<string>>(new Set());
  const image = s.images.find((n) => n.id === imageId) ?? null;
  const entityNames = s.culture.flatMap((c) => c.nodes.map((n) => String(n.data.name)));

  const show = (ids: string[]) => {
    setFocus(new Set(ids));
    document.getElementById(`card-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setFocus(new Set()), 4000);
  };

  return (
    <div className="absolute inset-0 z-[5] overflow-y-auto bg-ivory">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 pb-24 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-12">
          {/* 01 · The idea */}
          <Section n="01" title="The idea">
            {direction ? (
              <div className="rounded-cc-lg border border-line bg-paper p-6 shadow-card sm:p-8">
                <p className="cc-eyebrow text-violet-ink">Direction 0{direction.slot} · {direction.name}</p>
                <p className="cc-display mt-3 text-3xl leading-[1.1] sm:text-[40px]">{direction.coreIdea || direction.name}</p>
                {direction.positioning && <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink/80">{direction.positioning}</p>}
                {(direction.audience || direction.brandRole) && (
                  <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-[13px] sm:grid-cols-2">
                    {direction.audience && <div><dt className="cc-eyebrow text-muted">Who it’s for</dt><dd className="mt-1 leading-relaxed">{direction.audience}</dd></div>}
                    {direction.brandRole && <div><dt className="cc-eyebrow text-muted">The brand’s role</dt><dd className="mt-1 leading-relaxed">{direction.brandRole}</dd></div>}
                  </dl>
                )}
              </div>
            ) : (
              <Empty icon={Sparkles} title="Which idea is this board for?" body="Link a strategy direction and its idea, positioning and messages appear here, so everyone judges the images against the same thing.">
                {props.linkControl}
              </Empty>
            )}
          </Section>

          {/* 02 · Visual language */}
          <Section n="02" title="Visual language" action={canEdit && <Button size="sm" variant="outline" onClick={props.onUpload} disabled={props.uploading > 0}>{props.uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add images</Button>}>
            {s.images.length ? (
              <>
                <div className="columns-2 gap-3 sm:columns-3 xl:columns-4">
                  {s.images.map((n) => {
                    const fit = n.data.fit as ImageFitData | undefined;
                    const rights = (n.data.rights ?? "reference") as ImageRights;
                    return (
                      <button key={n.id} id={`card-${n.id}`} type="button" onClick={() => setImageId(n.id)}
                        className={cn("group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-cc border bg-paper text-left shadow-card transition-shadow hover:shadow-float", focus.has(n.id) ? "border-violet ring-4 ring-violet/25" : "border-line")}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
                        <img src={String(n.data.thumbUrl ?? n.data.url ?? "")} alt={String(n.data.alt || n.data.title || "")} className="block w-full" onError={props.onMediaError} />
                        <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11.5px]">
                          <span className="min-w-0 truncate text-muted">{host(n.data.sourceUrl) || (rights === "own" ? "Our own asset" : <span className="text-[#8a3d22]">No source</span>)}</span>
                          {fit?.level === "off" ? <span className="shrink-0 rounded-full bg-coral/80 px-1.5 py-0.5 text-[10.5px] font-medium">Off-audience</span>
                            : fit?.level === "strong" ? <span className="shrink-0 rounded-full bg-violet px-1.5 py-0.5 text-[10.5px] font-medium text-white">Fits</span>
                              : rights !== "reference" ? <span className="shrink-0 rounded-full bg-lilac px-1.5 py-0.5 text-[10.5px] font-medium text-violet-ink">{RIGHTS_LABEL[rights]}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {s.palette.length > 0 && (
                  <div className="mt-4 rounded-cc-lg border border-line bg-paper p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[13px] font-medium">Palette, from the images</p>
                      <Button size="sm" variant="ghost" onClick={props.onPalette}>Contrast and CSS</Button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {s.palette.map((c) => (
                        <button key={c} type="button" onClick={() => props.onCopy(c)} title={`Copy ${c}`} className="group text-left">
                          <span className="block h-14 rounded-cc-sm border border-ink/5 transition-transform group-hover:-translate-y-0.5" style={{ background: c }} />
                          <span className="mt-1.5 block truncate text-[11.5px] font-medium">{colourName(c)}</span>
                          <span className="block font-mono text-[10.5px] uppercase text-muted">{c}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Empty icon={ImagePlus} title="No images yet" body={canEdit ? "Drop images anywhere on this page, paste them (⌘V), or upload. Colours are picked from them for the palette, and each one is checked against the audience’s taste." : "Nothing has been added yet."}>
                {canEdit && <Button size="sm" onClick={props.onUpload}><ImagePlus /> Upload images</Button>}
              </Empty>
            )}
          </Section>

          {/* 03 · Cultural world */}
          <Section n="03" title="Cultural world" action={canEdit && <Button size="sm" variant="outline" onClick={() => props.onOpenResearch("qloo")}><Plus /> From research</Button>}>
            {direction && direction.culturalConnections.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[12px] text-muted">The direction draws on</span>
                {direction.culturalConnections.map((c) => {
                  const on = entityNames.some((n) => namedIn(n, [c]));
                  return <span key={c} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]", on ? "bg-lilac/70 text-violet-ink" : "border border-dashed border-line text-muted")}>{on && <Check className="size-3" />}{c}</span>;
                })}
              </div>
            )}
            {s.culture.length ? (
              <div className="space-y-5">
                {s.culture.map((g) => (
                  <div key={g.label}>
                    <p className="cc-eyebrow mb-2 text-muted">{g.label}</p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                      {g.nodes.map((n) => {
                        const a = typeof n.data.affinity === "number" ? n.data.affinity : null;
                        return (
                          <div key={n.id} id={`card-${n.id}`} className="group relative flex items-center gap-3 rounded-cc border border-line bg-paper p-2 pr-3">
                            <EntityImage src={n.data.imageUrl as string | null} theme={TYPE_THEME[String(n.data.type)] ?? "culture"} seed={String(n.data.entityId)} className="size-12 shrink-0 !rounded-[8px]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-medium">{String(n.data.name)}</p>
                              <p className="text-[11.5px] text-muted">{TYPE_LABEL[String(n.data.type)] ?? String(n.data.type)}</p>
                              {a !== null && <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink/5" title={`Affinity ${a.toFixed(2)}`}><span className="block h-full rounded-full bg-violet" style={{ width: `${Math.round(Math.max(0, Math.min(1, a)) * 100)}%` }} /></span>}
                            </div>
                            {canEdit && <RemoveButton label={`Remove ${String(n.data.name)}`} onClick={() => props.onRemove(n.id)} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[12px] text-muted">Affinity is how strongly the audience’s taste correlates with each reference (Qloo). It is not purchase intent.</p>
              </div>
            ) : (
              <Empty icon={Sparkles} title="No cultural references yet" body="Add the music, film, places and brands this audience over-indexes on, straight from your research.">
                {canEdit && <Button size="sm" onClick={() => props.onOpenResearch("qloo")}><Plus /> Add from research</Button>}
              </Empty>
            )}
          </Section>

          {/* 04 · Message and tone */}
          <Section n="04" title="Message and tone">
            {direction && (direction.messagingPillars.length > 0 || direction.creativeImplications) && (
              <div className="mb-5 grid gap-4 rounded-cc-lg border border-line bg-paper p-5 md:grid-cols-2">
                {direction.messagingPillars.length > 0 && (
                  <div>
                    <p className="cc-eyebrow mb-2 text-muted">What we say</p>
                    <ol className="space-y-2 text-[14px] leading-relaxed">
                      {direction.messagingPillars.map((p, i) => <li key={i} className="flex gap-2.5"><span className="font-mono text-[12px] text-violet-ink">0{i + 1}</span><span>{p}</span></li>)}
                    </ol>
                  </div>
                )}
                {direction.creativeImplications && (
                  <div>
                    <p className="cc-eyebrow mb-2 text-muted">What it means for the work</p>
                    <p className="text-[14px] leading-relaxed text-ink/85">{direction.creativeImplications}</p>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <NoteColumn role="do" title="Do" icon={ThumbsUp} notes={s.dos} canEdit={canEdit} onAdd={() => props.onAddNote("do")} onUpdate={props.onUpdate} onRemove={props.onRemove}
                empty="What the work should look and sound like, e.g. “warm, unhurried, shot on film”." />
              <NoteColumn role="dont" title="Don’t" icon={ThumbsDown} notes={s.donts} canEdit={canEdit} onAdd={() => props.onAddNote("dont")} onUpdate={props.onUpdate} onRemove={props.onRemove}
                empty="What would pull it off-brief, e.g. “no clinical white labs, no before-and-after”." />
            </div>
          </Section>

          {/* 05 · Proof */}
          <Section n="05" title="Proof" action={canEdit && <div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => props.onOpenResearch("evidence")}><Plus /> Evidence</Button><Button size="sm" variant="outline" onClick={props.onAddLink}><Link2 /> Link</Button></div>}>
            {s.proof.length || s.links.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {s.proof.map((n) => (
                  <div key={n.id} id={`card-${n.id}`} className="group relative rounded-cc border border-line bg-paper p-4 pr-9">
                    <p className="text-[14px] leading-relaxed">{String(n.data.claim)}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
                      <FileCheck2 className="size-3.5 text-violet" />
                      {n.data.url ? <a href={String(n.data.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-ink hover:underline">{host(n.data.url) || String(n.data.source)} <ExternalLink className="size-3" /></a> : String(n.data.source || "Research")}
                    </p>
                    {canEdit && <RemoveButton label="Remove this evidence" onClick={() => props.onRemove(n.id)} />}
                  </div>
                ))}
                {s.links.map((n) => (
                  <div key={n.id} id={`card-${n.id}`} className="group relative flex gap-3 rounded-cc border border-line bg-paper p-3 pr-9">
                    {typeof n.data.previewUrl === "string" && (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                      <img src={n.data.previewUrl} alt="" className="size-16 shrink-0 rounded-cc-sm object-cover" onError={props.onMediaError} />
                    )}
                    <div className="min-w-0">
                      <a href={String(n.data.url)} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[14px] font-medium hover:underline">{String(n.data.title || host(n.data.url))}</a>
                      <p className="text-[12px] text-muted">{String(n.data.siteName || host(n.data.url))}</p>
                      {n.data.note ? <p className="mt-1 line-clamp-2 text-[12.5px] text-ink/75">{String(n.data.note)}</p> : null}
                    </div>
                    {canEdit && <RemoveButton label="Remove this link" onClick={() => props.onRemove(n.id)} />}
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={FileCheck2} title="No proof yet" body="Add the cited facts that make this direction credible, so the client sees why, not just what.">
                {canEdit && <Button size="sm" onClick={() => props.onOpenResearch("evidence")}><Plus /> Add evidence</Button>}
              </Empty>
            )}
          </Section>

          {(s.notes.length > 0 || canEdit) && (
            <Section n="06" title="Team notes" action={canEdit && <Button size="sm" variant="outline" onClick={() => props.onAddNote("note")}><StickyNote /> Note</Button>}>
              {s.notes.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {s.notes.map((n) => <NoteCard key={n.id} node={n} canEdit={canEdit} onUpdate={props.onUpdate} onRemove={props.onRemove} />)}
                </div>
              ) : <p className="text-[13px] text-muted">Notes for the team. They stay off the client slides.</p>}
            </Section>
          )}
        </div>

        <HealthPanel checks={checks} onShow={show} canEdit={canEdit} onUpload={props.onUpload} onAddLink={props.onAddLink} onResearch={() => props.onOpenResearch("qloo")} onNote={() => props.onAddNote("do")} />
      </div>

      <ImageDialog node={image} canEdit={canEdit} pending={image ? props.fitPending.has(image.id) : false} onClose={() => setImageId(null)}
        onUpdate={props.onUpdate} onRemove={(id) => { setImageId(null); props.onRemove(id); }} onShowOnCanvas={(id) => { setImageId(null); props.onShowOnCanvas(id); }} onCheckFit={props.onCheckFit} />
    </div>
  );
}

function Section({ n, title, action, children }: { n: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`section-${n}`}>
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-line pb-2">
        <h2 id={`section-${n}`} className="flex items-baseline gap-3"><span className="font-mono text-[12px] text-muted">{n}</span><span className="cc-display text-2xl">{title}</span></h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, body, children }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-cc-lg border border-dashed border-line-strong/60 bg-paper/60 p-6">
      <Icon className="size-5 text-violet" />
      <div>
        <p className="text-[15px] font-medium">{title}</p>
        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
      {children}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100">
      <X className="size-3.5" />
    </button>
  );
}

function NoteCard({ node, canEdit, onUpdate, onRemove, compact }: { node: SectionNode; canEdit: boolean; onUpdate: (id: string, p: Record<string, unknown>) => void; onRemove: (id: string) => void; compact?: boolean }) {
  const text = String(node.data.text ?? "");
  return (
    <div id={`card-${node.id}`} className={cn("group relative rounded-cc border border-line bg-paper pr-8", compact ? "px-3 py-2" : "p-3")}>
      {canEdit && !node.data.locked
        ? <textarea aria-label="Note" value={text} onChange={(e) => onUpdate(node.id, { text: e.target.value })} maxLength={4000} rows={Math.min(6, Math.max(1, Math.ceil(text.length / 60)))}
          placeholder="Write it here" className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted/70" />
        : <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>}
      {canEdit && !node.data.locked && <RemoveButton label="Remove note" onClick={() => onRemove(node.id)} />}
    </div>
  );
}

function NoteColumn({ role, title, icon: Icon, notes, canEdit, onAdd, onUpdate, onRemove, empty }: {
  role: NoteRole; title: string; icon: React.ComponentType<{ className?: string }>; notes: SectionNode[]; canEdit: boolean; empty: string;
  onAdd: () => void; onUpdate: (id: string, p: Record<string, unknown>) => void; onRemove: (id: string) => void;
}) {
  return (
    <div className={cn("rounded-cc-lg border p-4", role === "do" ? "border-lavender/60 bg-lilac/25" : "border-peach bg-peach/25")}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[14px] font-medium"><Icon className={cn("size-4", role === "do" ? "text-violet" : "text-[#8a3d22]")} /> {title}</p>
        {canEdit && <Button size="sm" variant="ghost" onClick={onAdd}><Plus /> Add</Button>}
      </div>
      {notes.length ? <div className="space-y-2">{notes.map((n) => <NoteCard key={n.id} node={n} canEdit={canEdit} onUpdate={onUpdate} onRemove={onRemove} compact />)}</div>
        : <p className="text-[13px] leading-relaxed text-muted">{empty}</p>}
    </div>
  );
}

function HealthPanel({ checks, onShow, canEdit, onUpload, onAddLink, onResearch, onNote }: {
  checks: HealthCheck[]; onShow: (ids: string[]) => void; canEdit: boolean; onUpload: () => void; onAddLink: () => void; onResearch: () => void; onNote: () => void;
}) {
  const passed = checks.filter((c) => c.ok).length;
  return (
    <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start" aria-label="Board health">
      <div className="rounded-cc-lg border border-line bg-paper p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-medium">Ready for the client?</p>
          <span className={cn("text-[13px] font-medium", passed === checks.length ? "text-violet-ink" : "text-muted")}>{passed}/{checks.length}</span>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink/5"><span className="block h-full rounded-full bg-violet transition-[width] duration-500" style={{ width: `${(passed / checks.length) * 100}%` }} /></span>
        <ul className="mt-4 space-y-2.5">
          {checks.map((c) => (
            <li key={c.key} className="flex gap-2 text-[13px] leading-snug">
              {c.ok ? <CircleCheck className="mt-px size-4 shrink-0 text-violet" /> : <AlertTriangle className="mt-px size-4 shrink-0 text-[#b0632f]" />}
              <div className="min-w-0">
                <p className={c.ok ? "text-ink/80" : "font-medium"}>{c.label}</p>
                {!c.ok && c.hint && <p className="mt-0.5 text-[12px] text-muted">{c.hint}</p>}
                {!c.ok && c.ids?.length ? <button type="button" className="mt-0.5 text-[12px] font-medium text-violet-ink hover:underline" onClick={() => onShow(c.ids!)}>Show {c.ids.length === 1 ? "it" : "them"}</button> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      {canEdit && (
        <div className="rounded-cc-lg border border-line bg-paper p-2">
          <p className="cc-eyebrow px-2 pb-1 pt-1.5 text-muted">Add</p>
          {[
            { icon: ImagePlus, label: "Images", sub: "Upload, drop or paste", on: onUpload },
            { icon: Link2, label: "Link", sub: "With an automatic preview", on: onAddLink },
            { icon: Sparkles, label: "From research", sub: "Qloo matches and evidence", on: onResearch },
            { icon: ThumbsUp, label: "A do or don’t", sub: "Guardrails for the work", on: onNote },
          ].map((a) => (
            <button key={a.label} type="button" onClick={a.on} className="flex w-full items-center gap-3 rounded-cc-sm px-2 py-2 text-left hover:bg-ink/[0.04]">
              <a.icon className="size-4 text-violet" />
              <span><span className="block text-[13px] font-medium">{a.label}</span><span className="block text-[11.5px] text-muted">{a.sub}</span></span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

type ImageDialogProps = {
  node: SectionNode | null; canEdit: boolean; pending: boolean; onClose: () => void; onUpdate: (id: string, p: Record<string, unknown>) => void;
  onRemove: (id: string) => void; onShowOnCanvas: (id: string) => void; onCheckFit: (id: string) => void;
};

/** Keyed by card, so the source field starts from each image's own stored address. */
function ImageDialog(props: ImageDialogProps) {
  return props.node ? <ImageDetails key={props.node.id} {...props} node={props.node} /> : null;
}

function ImageDetails({ node, canEdit, pending, onClose, onUpdate, onRemove, onShowOnCanvas, onCheckFit }: ImageDialogProps & { node: SectionNode }) {
  const [source, setSource] = React.useState(String(node.data.sourceUrl ?? ""));
  const d = node.data;
  const fit = d.fit as ImageFitData | undefined;
  const saveSource = () => {
    const next = source.trim() ? safeUrl(source) : null;
    if (source.trim() && !next) return setSource(String(d.sourceUrl ?? ""));
    onUpdate(node.id, { sourceUrl: next });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={String(d.title || "Image")} description="Where it came from and how it may be used travel with the image into the slides and the report.">
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
          <img src={String(d.url ?? d.thumbUrl ?? "")} alt={String(d.alt || "")} className="max-h-[40vh] w-full rounded-cc object-contain bg-ivory" />
          {fit ? (
            <p className="flex gap-2 rounded-cc-sm bg-ink/[0.04] p-2.5 text-[12.5px] leading-relaxed">
              <ScanEye className="mt-0.5 size-4 shrink-0 text-violet" />
              <span><strong className="font-medium">{fit.level === "strong" ? "Fits the audience" : fit.level === "partial" ? "Partly fits" : fit.level === "off" ? "Looks off-audience" : "Not enough taste data"}</strong>{fit.tags.length ? ` (${fit.tags.join(", ")})` : ""}. {fit.rationale} <span className="text-muted">AI assessment, not evidence.</span></span>
            </p>
          ) : canEdit && typeof d.thumbPath === "string" && (
            <Button size="sm" variant="soft" disabled={pending} onClick={() => onCheckFit(node.id)}>{pending ? <Loader2 className="animate-spin" /> : <ScanEye />} Check fit with the audience</Button>
          )}
          {canEdit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="img-title"><Input id="img-title" value={String(d.title ?? "")} maxLength={200} onChange={(e) => onUpdate(node.id, { title: e.target.value })} /></Field>
              <Field label="Usage" htmlFor="img-rights">
                <select id="img-rights" value={String(d.rights ?? "reference")} onChange={(e) => onUpdate(node.id, { rights: e.target.value })}
                  className="h-10 w-full rounded-cc border border-line bg-paper px-3 text-[14px] outline-none focus:border-violet">
                  {IMAGE_RIGHTS.map((r) => <option key={r} value={r}>{RIGHTS_LABEL[r]}</option>)}
                </select>
              </Field>
              <Field label="Source (web address)" htmlFor="img-source"><Input id="img-source" value={source} placeholder="https://…" onChange={(e) => setSource(e.target.value)} onBlur={saveSource} /></Field>
              <Field label="Describe it (for screen readers)" htmlFor="img-alt"><Input id="img-alt" value={String(d.alt ?? "")} maxLength={300} onChange={(e) => onUpdate(node.id, { alt: e.target.value })} /></Field>
            </div>
          ) : (
            <p className="text-[13px] text-muted">{RIGHTS_LABEL[(d.rights ?? "reference") as ImageRights]}{d.sourceUrl ? <> · <a className="text-violet-ink hover:underline" href={String(d.sourceUrl)} target="_blank" rel="noopener noreferrer">{host(d.sourceUrl)}</a></> : " · no source"}</p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => onShowOnCanvas(node.id)}><MapPin /> Show on canvas</Button>
            <div className="flex gap-2">
              {canEdit && !d.locked && <Button size="sm" variant="ghost" onClick={() => onRemove(node.id)}><Trash2 /> Remove</Button>}
              <Button size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
