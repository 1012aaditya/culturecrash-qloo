"use client";

import * as React from "react";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { conceptTrailAction, type ConceptTrail } from "@/lib/concepts/actions";
import type { ImageFitData } from "@/lib/boards/schema";
import { cn } from "@/lib/utils";

const LEVEL: Record<string, { label: string; tone: string }> = {
  strong: { label: "Strong fit", tone: "bg-emerald-100 text-emerald-800" },
  partial: { label: "Partial fit", tone: "bg-amber-100 text-amber-800" },
  off: { label: "Off-taste", tone: "bg-peach text-[#8a3d22]" },
  unknown: { label: "Not judged", tone: "bg-ink/5 text-muted" },
};
export const fitLabel = (level: string) => LEVEL[level]?.label ?? level;

function Level({ level }: { level: string }) {
  const l = LEVEL[level] ?? LEVEL.unknown;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", l.tone)}>{l.label}</span>;
}

function Step({ n, title, children, last }: { n: number; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-3 pb-5">
      {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" aria-hidden="true" />}
      <span className="flex size-7 items-center justify-center rounded-full bg-lilac text-[12px] font-semibold text-violet-ink">{n}</span>
      <div className="min-w-0 pt-0.5">
        <p className="cc-eyebrow text-muted">{title}</p>
        <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

/**
 * "Why this image": the chain from the audience's Qloo taste signals and cited evidence, through the
 * strategy direction and the art direction, to the exact prompt and the fit check of the result.
 */
export function ConceptTrailDialog({ boardId, jobId, title, fit, improvedFrom, onClose }: {
  boardId: string; jobId: string; title: string; fit: ImageFitData | undefined; improvedFrom: string | undefined; onClose: () => void;
}) {
  const [trail, setTrail] = React.useState<ConceptTrail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    void conceptTrailAction(boardId, jobId).then((r) => {
      if (!live) return;
      if (r.ok) setTrail(r.data!);
      else setError(r.error);
    });
    return () => { live = false; };
  }, [boardId, jobId]);

  const p = trail?.provenance;
  const matched = new Set((fit?.tags ?? []).map((t) => t.toLowerCase()));
  const from = improvedFrom ?? trail?.parentFit?.level ?? p?.improvement?.fromLevel;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(680px,calc(100vw-24px))]" title={`Why this image: ${title || "AI concept"}`}
        description="Every AI concept keeps the trail from culture data to picture, so the team can defend it to a client.">
        {error ? <p className="text-[13px] text-danger">{error}</p> : !p ? (
          <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Loading the trail…</p>
        ) : (
          <>
            <ol>
              <Step n={1} title="Audience taste signals · Qloo">
                {p.signals.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.signals.map((s) => (
                      <span key={s.name} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]", matched.has(s.name.toLowerCase()) ? "border-violet bg-lilac/60 text-violet-ink" : "border-line")}>
                        {s.name}{s.affinity !== null && <span className="text-muted">{Math.round(s.affinity * 100)}%</span>}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-muted">No completed research run yet.</p>}
                {matched.size > 0 && <p className="text-[11.5px] text-muted">Highlighted: the signals the fit check sees in this image.</p>}
              </Step>
              <Step n={2} title="Evidence behind the direction">
                {p.evidence.length ? p.evidence.map((e) => (
                  <p key={e.id}>“{e.claim}”{" "}
                    {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-violet-ink hover:underline">{e.source ?? "source"} <ExternalLink className="size-3" /></a> : e.source && <span className="text-muted">({e.source})</span>}
                  </p>
                )) : <p className="text-muted">No evidence cited by this direction.</p>}
              </Step>
              <Step n={3} title="Strategy direction">
                {p.direction ? (
                  <>
                    <p><span className="font-medium">Direction 0{p.direction.slot} · {p.direction.name}.</span> {p.direction.coreIdea}</p>
                    {p.connections.length > 0 && <div className="flex flex-wrap gap-1.5">{p.connections.map((c) => <span key={c} className="rounded-full bg-ink/5 px-2 py-0.5 text-[12px]">{c}</span>)}</div>}
                  </>
                ) : <p className="text-muted">No direction linked; built from the brief and taste signals.</p>}
              </Step>
              <Step n={4} title="Art direction">
                {p.why && <p>{p.why}</p>}
                {p.improvement ? (
                  <div className="rounded-cc border border-line bg-ivory p-3">
                    <p className="flex items-center gap-1.5 text-[12px] font-medium"><Level level={p.improvement.fromLevel} /> <ArrowRight className="size-3.5" /> rewritten by the AI art director</p>
                    <p className="mt-1.5">{p.improvement.diagnosis}</p>
                    <ul className="mt-1.5 list-disc pl-5">{p.improvement.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                ) : !p.why && <p className="text-muted">Written from the direction and the brief.</p>}
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-muted hover:text-ink">Exact prompt</summary>
                  <p className="mt-1.5 rounded-cc bg-ink/5 p-2.5 font-mono text-[11.5px] leading-relaxed">{p.prompt}</p>
                </details>
              </Step>
              <Step n={5} title="Cultural-fit check of this image" last>
                {fit ? (
                  <>
                    <p className="flex flex-wrap items-center gap-1.5">{from && from !== fit.level && <><Level level={from} /><ArrowRight className="size-3.5" /></>}<Level level={fit.level} /></p>
                    <p>{fit.rationale}</p>
                  </>
                ) : <p className="text-muted">Not checked yet.</p>}
              </Step>
            </ol>
            <p className="border-t border-line pt-3 text-[11px] text-muted">
              Made with {trail.model} on the agency’s GPU PC. Affinity is a taste correlation, not purchase intent; the fit check is an AI hypothesis, not evidence. AI concept · not final artwork.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
