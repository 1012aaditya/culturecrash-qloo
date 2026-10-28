"use client";

import Link from "next/link";
import { CheckCircle2, GitCompare, History, Loader2, PencilLine, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { Comments } from "@/components/evidence/comments";
import { DemoBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { DirectionContent } from "@/lib/ai/schemas";
import { editDirectionAction, reviseDirectionAction, selectDirectionAction } from "@/lib/strategy/actions";
import { cn, timeAgo } from "@/lib/utils";

export type DirectionView = {
  id: string; slot: number; revision: number; name: string; content: DirectionContent; status: string; isExploratory: boolean; revisionNote: string | null;
  createdAt: string; evidence: { id: string; claim: string }[]; revisionCount: number; comments: { id: string; body: string; author: string; createdAt: string }[];
};

const THEMES: PlateTheme[] = ["culture", "fashion", "music"];
const LAYOUT = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-12"];

export function StrategyStudio({ projectId, directions, canEdit, llm, generatorLabel, isDemo, theme }: {
  projectId: string; directions: DirectionView[]; canEdit: boolean; llm: boolean; generatorLabel: string; isDemo: boolean; theme: PlateTheme;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {directions.map((d, i) => (
        <Territory key={d.id} d={d} projectId={projectId} canEdit={canEdit} llm={llm} wide={i === 2} className={LAYOUT[i]} theme={i === 0 ? theme : THEMES[i]} generatorLabel={generatorLabel} isDemo={isDemo} />
      ))}
    </div>
  );
}

function Territory({ d, projectId, canEdit, llm, className, wide, theme, generatorLabel, isDemo }: {
  d: DirectionView; projectId: string; canEdit: boolean; llm: boolean; className: string; wide: boolean; theme: PlateTheme; generatorLabel: string; isDemo: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = React.useState<"edit" | "revise" | "select" | null>(null);
  const [pending, start] = React.useTransition();
  const c = d.content;
  const selected = d.status === "selected";

  const select = () =>
    start(async () => {
      const r = await selectDirectionAction(d.id);
      if (!r.ok) return toast({ tone: "error", title: r.error });
      setDialog(null);
      toast({ tone: "success", title: `“${d.name}” selected`, description: "Generate the creative brief from the Create stage." });
      router.refresh();
    });

  return (
    <article id={`direction-${d.id}`} className={cn("scroll-mt-28 overflow-hidden rounded-[32px] border bg-paper shadow-card", selected ? "border-violet ring-4 ring-lilac" : "border-line", className)}>
      <div className={cn("grid", wide && "lg:grid-cols-[0.9fr_1.4fr]")}>
        <header className={cn("relative overflow-hidden bg-charcoal text-white", wide ? "min-h-[360px]" : "min-h-[280px]")}>
          <ArtPlate theme={theme} seed={`${d.id}-${d.slot}`} rounded={false} className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/30 to-transparent" />
          <div className="absolute inset-x-6 top-6 flex flex-wrap items-center gap-1.5">
            <Badge tone="glass">Direction 0{d.slot}</Badge>
            {selected && <Badge tone="violet"><CheckCircle2 /> Selected</Badge>}
            {d.isExploratory && <Badge tone="peach">Exploratory</Badge>}
            {isDemo && <DemoBadge label="Demo" />}
          </div>
          <div className="absolute inset-x-6 bottom-6">
            <h2 className="cc-display text-5xl leading-[0.95]">{d.name}</h2>
            <p className="mt-3 max-w-xl text-[15px] leading-snug text-white/85">{c.coreIdea}</p>
          </div>
        </header>
        <div className="space-y-5 p-6">
          <blockquote className="border-l-2 border-violet pl-4 font-serif text-[22px] leading-snug">“{c.positioningStatement}”</blockquote>
          <div className={cn("grid gap-5 text-[13px]", wide && "md:grid-cols-2")}>
            <Block title="Strategic rationale">{c.strategicRationale}</Block>
            <Block title="Audience context">{c.audienceContext}</Block>
            {c.consumerTension && <Block title="Consumer tension">{c.consumerTension}</Block>}
            <Block title="Differentiation">{c.differentiation}</Block>
            <Block title="Messaging pillars"><ul className="space-y-1">{c.messagingPillars.map((p) => <li key={p}>— {p}</li>)}</ul></Block>
            <Block title="Creative implications">{c.creativeImplications}</Block>
            <Block title="Trade-offs">{c.tradeOffs}</Block>
            <Block title="Uncertainties" tone="warn">{c.uncertainties}</Block>
            <Block title="Assumptions to test"><ul className="space-y-1">{c.assumptionsToTest.map((a) => <li key={a}>? {a}</li>)}</ul></Block>
            <Block title="Suggested experiment">{c.suggestedExperiment}</Block>
          </div>
          {c.culturalConnections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{c.culturalConnections.map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div>
          )}
          <details className="rounded-cc-sm border border-line p-3">
            <summary className="cursor-pointer text-[12px] font-medium">Evidence trail ({d.evidence.length}){d.evidence.length === 0 && " — no supporting observations; treat as exploratory"}</summary>
            <ul className="mt-2 space-y-1">{d.evidence.map((e) => <li key={e.id}><Link className="text-[12px] text-ink/80 hover:text-violet" href={`/projects/${projectId}/evidence/${e.id}`}>• {e.claim}</Link></li>)}</ul>
          </details>
          <p className="text-[11px] text-faint">{generatorLabel} · revision {d.revision}{d.revisionNote ? ` · ${d.revisionNote.slice(0, 90)}` : ""} · {timeAgo(d.createdAt)}</p>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {canEdit && !selected && <Button size="sm" onClick={() => setDialog("select")}><CheckCircle2 /> Select direction</Button>}
            {canEdit && <Button size="sm" variant="outline" onClick={() => setDialog("edit")}><PencilLine /> Edit</Button>}
            {canEdit && <Button size="sm" variant="outline" onClick={() => setDialog("revise")}><Wand2 /> Ask for revision</Button>}
            {d.revisionCount > 1 && <Button size="sm" variant="ghost" asChild><Link href={`/projects/${projectId}/strategy/compare?direction=${d.id}`}><History /> {d.revisionCount} versions</Link></Button>}
          </div>
          <details>
            <summary className="cursor-pointer text-[12px] font-medium">Comments ({d.comments.length})</summary>
            <div className="mt-3"><Comments projectId={projectId} targetType="direction" targetId={d.id} path={`/projects/${projectId}/strategy`} canComment={canEdit} comments={d.comments} /></div>
          </details>
        </div>
      </div>

      <Dialog open={dialog === "select"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={`Select “${d.name}”?`} description="This becomes the campaign’s preferred direction and the basis for the creative brief. Any previously selected direction returns to draft; nothing is deleted.">
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={select} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Select</Button></div>
        </DialogContent>
      </Dialog>
      {dialog === "edit" && <EditDialog d={d} onClose={() => setDialog(null)} />}
      {dialog === "revise" && <ReviseDialog d={d} llm={llm} onClose={() => setDialog(null)} />}
    </article>
  );
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div>
      <h3 className={cn("text-[11px] font-medium uppercase tracking-wider", tone === "warn" ? "text-warning" : "text-muted")}>{title}</h3>
      <div className="mt-1 leading-relaxed">{children}</div>
    </div>
  );
}

function EditDialog({ d, onClose }: { d: DirectionView; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState({ ...d.content, messagingPillars: d.content.messagingPillars.join("\n"), assumptionsToTest: d.content.assumptionsToTest.join("\n") });
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const fields: [keyof typeof v, string, boolean][] = [
    ["name", "Name", false], ["coreIdea", "Core idea", true], ["positioningStatement", "Positioning statement", true], ["audienceContext", "Audience context", true],
    ["strategicRationale", "Strategic rationale", true], ["differentiation", "Differentiation", true], ["messagingPillars", "Messaging pillars (one per line)", true],
    ["creativeImplications", "Creative implications", true], ["tradeOffs", "Trade-offs", true], ["uncertainties", "Uncertainties", true],
    ["assumptionsToTest", "Assumptions to test (one per line)", true], ["suggestedExperiment", "Suggested experiment", true],
  ];
  const save = () =>
    start(async () => {
      const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
      const r = await editDirectionAction(d.id, {
        name: v.name, coreIdea: v.coreIdea, positioningStatement: v.positioningStatement, audienceContext: v.audienceContext, consumerTension: v.consumerTension,
        strategicRationale: v.strategicRationale, differentiation: v.differentiation, messagingPillars: lines(v.messagingPillars), creativeImplications: v.creativeImplications,
        tradeOffs: v.tradeOffs, uncertainties: v.uncertainties, assumptionsToTest: lines(v.assumptionsToTest), suggestedExperiment: v.suggestedExperiment,
      }, note);
      if (!r.ok) return toast({ tone: "error", title: r.error });
      toast({ tone: "success", title: "New version saved", description: "The previous version is preserved." });
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit “${d.name}”`} description="Saving creates a new version. Earlier versions are kept and can be compared." className="max-h-[80vh] w-[min(760px,calc(100vw-24px))] overflow-y-auto">
        <div className="space-y-4">
          {fields.map(([k, label, multi]) => (
            <Field key={k} label={label} htmlFor={`ed-${k}`}>
              {multi ? <Textarea id={`ed-${k}`} value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <Input id={`ed-${k}`} value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
            </Field>
          ))}
          <Field label="Change note" htmlFor="ed-note" optional><Input id="ed-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What changed and why" /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save new version"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviseDialog({ d, llm, onClose }: { d: DirectionView; llm: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Ask for a targeted revision" description={llm ? "The AI revises only what you ask for and saves the result as a new version." : "No LLM is configured on this server, so AI revisions are unavailable. Use Edit to change fields directly."}>
        <Textarea aria-label="Revision request" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Make the positioning less product-led and sharpen the second messaging pillar" disabled={!llm} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!llm || pending || text.trim().length < 4} onClick={() => start(async () => {
            const r = await reviseDirectionAction(d.id, text);
            if (!r.ok) return toast({ tone: "error", title: r.error });
            toast({ tone: "success", title: "Revision saved as a new version" });
            onClose();
            router.refresh();
          })}>{pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Revise</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompareLink({ projectId }: { projectId: string }) {
  return <Button asChild variant="outline"><Link href={`/projects/${projectId}/strategy/compare`}><GitCompare /> Compare directions</Link></Button>;
}
