"use client";

import { AlertTriangle, CheckCircle2, Crosshair, FileWarning, HelpCircle, Loader2, ShieldAlert, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Ago } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import type { RedTeamCritique } from "@/lib/ai/schemas";
import { redTeamStrategyAction, reviseDirectionAction, type SavedCritique } from "@/lib/strategy/actions";
import { cn } from "@/lib/utils";

const VERDICT: Record<RedTeamCritique["overallVerdict"], { label: string; tone: "success" | "warning" | "peach" | "danger" }> = {
  bulletproof: { label: "Ready to pitch", tone: "success" },
  promising_with_caveats: { label: "Promising, with caveats", tone: "warning" },
  vulnerable: { label: "Vulnerable", tone: "peach" },
  high_risk: { label: "High risk", tone: "danger" },
};

/**
 * Client Devil's Advocate: the sceptical-CMO review of a strategy version. The latest saved review is
 * shown without re-running; each objection can be answered with a one-click AI revision of that direction.
 */
export function RedTeamButton({ projectId, versionId, llm, canEdit, saved }: { projectId: string; versionId: string; llm: boolean; canEdit: boolean; saved: SavedCritique | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [revising, setRevising] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState<SavedCritique | null>(saved);
  // A newer saved review arriving from the server (after a refresh) replaces what's shown.
  const [seenId, setSeenId] = React.useState(saved?.id ?? null);
  if ((saved?.id ?? null) !== seenId) {
    setSeenId(saved?.id ?? null);
    setCurrent(saved);
  }

  async function run() {
    setLoading(true);
    setOpen(true);
    try {
      const res = await redTeamStrategyAction(projectId, versionId);
      if (!res.ok || !res.data) {
        toast({ tone: "error", title: "Devil's Advocate review failed", description: res.ok ? "No critique was returned." : res.error });
        if (!current) setOpen(false);
        return;
      }
      setCurrent(res.data);
    } catch {
      toast({ tone: "error", title: "Devil's Advocate review failed", description: "The request failed or timed out. Try again." });
    } finally {
      setLoading(false);
    }
  }

  async function answer(c: RedTeamCritique["critiques"][number]) {
    if (!c.directionId) return;
    setRevising(c.directionId);
    try {
      const instruction = `Answer this client objection without weakening what works. Objection: ${c.fatalFlaw} Their toughest question: ${c.toughestClientQuestion} Suggested defence: ${c.suggestedDefense}`.slice(0, 1000);
      const r = await reviseDirectionAction(c.directionId, instruction);
      if (!r.ok) return toast({ tone: "error", title: "Revision not saved", description: r.error });
      toast({ tone: "success", title: `New revision of “${c.directionName}” saved`, description: "It answers the objection; the previous revision is kept in its history." });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ tone: "error", title: "Revision not saved", description: "The request failed or timed out. Try again." });
    } finally {
      setRevising(null);
    }
  }

  const trigger = current
    ? <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-coral/40 text-coral hover:bg-coral/10 hover:text-coral"><ShieldAlert className="size-3.5" /> Devil&rsquo;s Advocate · {VERDICT[current.critique.overallVerdict].label}</Button>
    : <Button variant="outline" size="sm" onClick={run} disabled={!llm || !canEdit} title={!llm ? "Needs an AI model: the critique is never invented from a template." : undefined} className="border-coral/40 text-coral hover:bg-coral/10 hover:text-coral"><ShieldAlert className="size-3.5" /> Devil&rsquo;s Advocate</Button>;

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Client Devil’s Advocate" description="How a sceptical CMO would attack each direction, and what to do about it" className="max-h-[90vh] max-w-3xl overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="size-8 animate-spin text-coral" />
              <p className="mt-4 text-[14px] font-medium">Reading the directions like a sceptical client…</p>
              <p className="mt-1 max-w-sm text-[12px] text-muted">Checking the weakest evidence, who already owns each position, and the hardest questions in the room.</p>
            </div>
          ) : current ? (
            <div className="mt-2 space-y-6">
              <div className="rounded-cc-md border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Verdict</span>
                  <Badge tone={VERDICT[current.critique.overallVerdict].tone}>{VERDICT[current.critique.overallVerdict].label}</Badge>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink">{current.critique.executiveSummary}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
                  <span>{current.generator.replace("llm:", "")} · <Ago value={current.createdAt} /> · saved with this strategy version and included in reports</span>
                  {llm && canEdit && <Button size="sm" variant="ghost" onClick={run}><ShieldAlert /> Run again</Button>}
                </div>
              </div>

              {current.critique.critiques.map((c) => (
                <div key={`${c.directionSlot}-${c.directionId ?? c.directionName}`} className="rounded-cc-lg border border-line bg-ivory/50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-paper text-[11px] font-semibold text-muted">0{c.directionSlot}</span>
                      <h3 className="text-[14px] font-semibold text-ink">{c.directionName}</h3>
                    </div>
                    {llm && canEdit && c.directionId && (
                      <Button size="sm" variant="outline" disabled={revising !== null} onClick={() => answer(c)}>
                        {revising === c.directionId ? <Loader2 className="animate-spin" /> : <Wand2 />} Revise to answer this
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 text-[12px]">
                    <Point icon={AlertTriangle} title="Biggest vulnerability" className="border-coral/20 bg-coral/5" titleClass="text-coral">{c.fatalFlaw}</Point>
                    {c.weakestEvidence && <Point icon={FileWarning} title="Weakest evidence" titleClass="text-warning">{c.weakestEvidence}</Point>}
                    {c.nearestCompetitor && <Point icon={Crosshair} title="Who already owns this" titleClass="text-violet">{c.nearestCompetitor}</Point>}
                    <Point icon={Crosshair} title="How a competitor would counter" titleClass="text-violet">{c.competitorCounter}</Point>
                    <Point icon={AlertTriangle} title="Cultural risk" titleClass="text-warning">{c.culturalRisk}</Point>
                    <Point icon={HelpCircle} title="Toughest question in the room" titleClass="text-ink"><span className="italic">{c.toughestClientQuestion}</span></Point>
                    <Point icon={CheckCircle2} title="How to answer it" className="border-leaf/30 bg-leaf/10" titleClass="text-leaf">{c.suggestedDefense}</Point>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Point({ icon: Icon, title, children, className, titleClass }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; className?: string; titleClass?: string }) {
  return (
    <div className={cn("rounded-cc-sm border border-line bg-paper p-3", className)}>
      <span className={cn("flex items-center gap-1.5 font-semibold", titleClass)}><Icon className="size-3.5" /> {title}</span>
      <p className="mt-1 text-ink">{children}</p>
    </div>
  );
}
