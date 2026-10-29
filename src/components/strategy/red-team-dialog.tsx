"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Crosshair, HelpCircle, Loader2, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { RedTeamCritique } from "@/lib/ai/schemas";
import { redTeamStrategyAction } from "@/lib/strategy/actions";
import { cn } from "@/lib/utils";

export function RedTeamButton({ projectId, versionId }: { projectId: string; versionId?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [critique, setCritique] = React.useState<{ data: RedTeamCritique; generator: string } | null>(null);

  async function handleRun() {
    setLoading(true);
    setOpen(true);
    const res = await redTeamStrategyAction(projectId, versionId);
    setLoading(false);
    if (!res.ok) {
      toast({ tone: "error", title: "Red-Team review failed", description: res.error });
      setOpen(false);
      return;
    }
    if (!res.data) {
      toast({ tone: "error", title: "Red-Team review failed", description: "No critique was returned." });
      setOpen(false);
      return;
    }
    setCritique({ data: res.data.critique, generator: res.data.generator });
  }

  const verdictStyles: Record<RedTeamCritique["overallVerdict"], { label: string; tone: "success" | "warning" | "peach" | "danger" }> = {
    bulletproof: { label: "Bulletproof", tone: "success" },
    promising_with_caveats: { label: "Promising with Caveats", tone: "warning" },
    vulnerable: { label: "Vulnerable", tone: "peach" },
    high_risk: { label: "High Risk", tone: "danger" },
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRun}
        className="border-coral/40 text-coral hover:bg-coral/10 hover:text-coral"
      >
        <ShieldAlert className="size-3.5 text-coral" />
        Red-team stress test
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Adversarial Red-Team Stress Test"
          description="Ruthless partner critique, competitor counters & pitch stress-tests"
          className="max-h-[90vh] max-w-3xl overflow-y-auto p-6"
        >
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-coral/15 text-coral">
                <ShieldAlert className="size-4" />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight">Adversarial Red-Team Stress Test</h2>
                <p className="text-[12px] text-muted">Ruthless partner critique, competitor counters & pitch stress-tests</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted hover:bg-ivory hover:text-ink">
              <X className="size-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="size-8 animate-spin text-coral" />
              <p className="mt-4 text-[14px] font-medium">Running adversarial red-team simulation…</p>
              <p className="mt-1 max-w-sm text-[12px] text-muted">Stress-testing positioning directions against skeptical client scrutiny and competitor counter-attacks.</p>
            </div>
          ) : critique ? (
            <div className="mt-5 space-y-6">
              {/* Executive Summary */}
              <div className="rounded-cc-md border border-line bg-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Overall Strategic Verdict</span>
                  <Badge tone={verdictStyles[critique.data.overallVerdict].tone}>
                    {verdictStyles[critique.data.overallVerdict].label}
                  </Badge>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink">{critique.data.executiveSummary}</p>
                <p className="mt-2 text-[11px] text-faint">Evaluated by {critique.generator.replace("llm:", "")}</p>
              </div>

              {/* Critiques per direction */}
              <div className="space-y-4">
                {critique.data.critiques.map((c) => (
                  <div key={c.directionSlot} className="rounded-cc-lg border border-line bg-ivory/50 p-5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-paper text-[11px] font-semibold text-muted">
                        0{c.directionSlot}
                      </span>
                      <h3 className="text-[14px] font-semibold text-ink">{c.directionName}</h3>
                    </div>

                    <div className="mt-4 grid gap-3 text-[12px]">
                      <div className="rounded-cc-sm border border-coral/20 bg-coral/5 p-3">
                        <span className="flex items-center gap-1.5 font-semibold text-coral">
                          <AlertTriangle className="size-3.5" /> Fatal Flaw / Vulnerability
                        </span>
                        <p className="mt-1 text-ink">{c.fatalFlaw}</p>
                      </div>

                      <div className="rounded-cc-sm border border-line bg-paper p-3">
                        <span className="flex items-center gap-1.5 font-semibold text-warning">
                          <Flame className="size-3.5 text-warning" /> Cultural & Inauthenticity Risk
                        </span>
                        <p className="mt-1 text-muted">{c.culturalRisk}</p>
                      </div>

                      <div className="rounded-cc-sm border border-line bg-paper p-3">
                        <span className="flex items-center gap-1.5 font-semibold text-violet">
                          <Crosshair className="size-3.5 text-violet" /> Competitor Counter-Attack
                        </span>
                        <p className="mt-1 text-muted">{c.competitorCounter}</p>
                      </div>

                      <div className="rounded-cc-sm border border-line bg-paper p-3">
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <HelpCircle className="size-3.5 text-ink" /> Toughest Client Pitch Question
                        </span>
                        <p className="mt-1 italic text-ink">{c.toughestClientQuestion}</p>
                      </div>

                      <div className="rounded-cc-sm border border-leaf/30 bg-leaf/10 p-3">
                        <span className="flex items-center gap-1.5 font-semibold text-leaf">
                          <CheckCircle2 className="size-3.5" /> Recommended Strategic Defense
                        </span>
                        <p className="mt-1 text-ink">{c.suggestedDefense}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Flame({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
