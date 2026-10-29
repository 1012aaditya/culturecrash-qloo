"use client";

import { AlertTriangle, ChevronDown, ExternalLink, FileText, Loader2, Square } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { When } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { cancelResearchAction } from "@/lib/research/actions";
import type { ClaimRow, DeepView, DocumentRow } from "@/lib/research/deep/view-types";
import { cn } from "@/lib/utils";

const STAGES = [
  ["planning", "Planning"], ["affinity", "Qloo"], ["searching", "Searching"], ["retrieving", "Reading pages"],
  ["extracting", "Extracting claims"], ["analyzing", "Checking coverage"], ["follow_up", "Following up"], ["synthesizing", "Writing report"],
] as const;

const CLAIM_LABEL: Record<string, string> = {
  observed_measurement: "Measurement (reported)", source_fact: "Source-reported fact", source_opinion: "Reported opinion",
  model_interpretation: "AI interpretation", strategic_hypothesis: "Hypothesis", experiment_result: "Experiment result", validated_conclusion: "Validated conclusion",
};
const STOP: Record<string, string> = {
  sufficient_coverage: "Stopped: the key questions were covered", max_rounds: "Stopped: follow-up limit for this depth", budget_limit: "Stopped: budget limit reached",
  time_limit: "Stopped: time limit reached", provider_call_limit: "Stopped: provider call limit reached", low_marginal_gain: "Stopped: more searching was not adding independent sources",
  no_follow_up: "Stopped: no new follow-up queries", cancelled: "Cancelled by a user", error: "Stopped by an error", stale: "Worker stopped responding",
};

export function ResearchProgress({ projectId, runId, stage, live, cancelRequested, canCancel }: {
  projectId: string; runId: string; stage: string | null; live: { documents: number; claims: number; calls: number; failedCalls: number } | null; cancelRequested: boolean; canCancel: boolean;
}) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = React.useState(cancelRequested);
  const idx = STAGES.findIndex(([k]) => k === stage);
  return (
    <section className="cc-animate-in rounded-[28px] border border-line bg-paper p-5 shadow-card" aria-live="polite" aria-label="Research progress">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Loader2 className="size-4 animate-spin text-violet" /> Research in progress</h2>
        {canCancel && (
          <Button size="sm" variant="ghost" disabled={cancelling} onClick={async () => {
            setCancelling(true);
            const r = await cancelResearchAction(projectId, runId);
            if (!r.ok) { setCancelling(false); toast({ tone: "error", title: r.error ?? "Could not cancel" }); }
          }}><Square /> {cancelling ? "Stopping after the current step…" : "Cancel"}</Button>
        )}
      </div>
      <ol className="mt-4 flex flex-wrap gap-1.5">
        {STAGES.map(([k, label], i) => (
          <li key={k} className={cn("rounded-full px-2.5 py-1 text-[11px] transition-colors duration-500", i < idx ? "bg-lilac/60 text-violet-ink" : i === idx ? "bg-violet text-white cc-animate-pulse" : "bg-ink/5 text-faint")}>{label}</li>
        ))}
      </ol>
      {live && (
        <dl className="mt-4 grid grid-cols-4 gap-3 text-[12px]">
          {[["Sources", live.documents], ["Claims", live.claims], ["Provider calls", live.calls], ["Failed calls", live.failedCalls]].map(([l, v]) => (
            <div key={l as string}><dt className="text-muted">{l}</dt><dd className="text-2xl font-light tabular-nums">{v}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function ResearchReport({ deep, isDemo }: { deep: DeepView; isDemo: boolean }) {
  const [tab, setTab] = React.useState<"report" | "sources" | "claims">("report");
  const [openClaim, setOpenClaim] = React.useState<string | null>(null);
  const sourceClaims = deep.claims.filter((c) => ["source_fact", "source_opinion", "observed_measurement"].includes(c.claimType));
  const num = new Map(sourceClaims.map((c, i) => [c.id, i + 1]));
  const docById = new Map(deep.documents.map((d) => [d.id, d]));
  const r = deep.report;
  const u = deep.usage;
  const questions = deep.plan?.questions ?? [];
  const cite = (ids: string[]) => ids.filter((id) => num.has(id)).map((id) => (
    <button key={id} onClick={() => { setTab("claims"); setOpenClaim(id); requestAnimationFrame(() => document.getElementById(`claim-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); }}
      className="ml-1 rounded-full bg-lilac/60 px-1.5 font-mono text-[10px] text-violet-ink transition-colors hover:bg-violet hover:text-white" aria-label={`Open claim ${num.get(id)}`}>{num.get(id)}</button>
  ));

  return (
    <section className="cc-animate-in rounded-[28px] border border-line bg-paper shadow-card" aria-label="Research report">
      <header className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold">Research report</h2>
          <Badge tone="outline">{deep.depth}</Badge>
          {r && <Badge tone={r.completeness === "complete" ? "success" : r.completeness === "partial" ? "warning" : "danger"}>{r.completeness}</Badge>}
          {isDemo && <Badge tone="peach">Demonstration data</Badge>}
          {r && <span className="text-[11px] text-muted">{r.generator === "rules" ? "Written by rules (no LLM)" : `Synthesis · ${r.generator.replace("llm:", "")}`}</span>}
        </div>
        {deep.question && <p className="mt-2 text-[13px] text-muted">Question: <span className="text-ink">{deep.question}</span></p>}
        {deep.stopReason && <p className="mt-1 text-[11px] text-muted">{STOP[deep.stopReason] ?? deep.stopReason}</p>}
        {u && (
          <dl className="mt-4 grid grid-cols-3 gap-3 text-[12px] sm:grid-cols-6">
            {[
              ["Sources", deep.documents.length], ["Independent", u.independentSources ?? "—"], ["Duplicates removed", deep.duplicatesRemoved],
              ["Claims", sourceClaims.length], ["Calls", `${u.providerCalls}${u.failedCalls ? ` (${u.failedCalls} failed)` : ""}`], ["Est. cost", `$${(u.usdEstimated ?? 0).toFixed(3)}`],
            ].map(([l, v]) => <div key={l as string}><dt className="text-muted">{l}</dt><dd className="text-lg font-light tabular-nums">{v}</dd></div>)}
          </dl>
        )}
        <div className="mt-4 flex gap-1" role="tablist">
          {(["report", "sources", "claims"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-full px-3 py-1.5 text-[12px] capitalize transition-colors", tab === t ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink")}>
              {t}{t === "sources" ? ` · ${deep.documents.length}` : t === "claims" ? ` · ${sourceClaims.length}` : ""}
            </button>
          ))}
        </div>
      </header>

      {tab === "report" && (
        <div className="space-y-6 p-5">
          {!r ? <p className="text-[13px] text-muted">The report appears when the job finishes.</p> : (
            <>
              <p className="text-[14px] leading-relaxed">{r.summary}</p>
              {questions.map((q) => {
                const cov = r.coverage.find((c) => c.key === q.key);
                const fs = r.findings.filter((f) => f.questionKey === q.key);
                return (
                  <div key={q.key} className="cc-reveal">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-semibold">{q.text}</h3>
                      {cov && <Badge tone={cov.status === "sufficient" ? "success" : cov.status === "thin" ? "warning" : "danger"}>{cov.status === "sufficient" ? `${cov.independent} independent sources` : cov.status === "thin" ? "thin evidence" : "no evidence found"}</Badge>}
                    </div>
                    {fs.length ? (
                      <ul className="mt-2 space-y-2">
                        {fs.map((f, i) => (
                          <li key={i} className={cn("rounded-cc-sm border-l-2 py-1 pl-3 text-[13px] leading-relaxed", f.kind === "supported" ? "border-ink" : "border-violet")}>
                            <span className="mr-1.5 text-[10px] uppercase tracking-wider text-muted">{f.kind === "supported" ? "Supported" : "Interpretation"} · {f.strength}</span>
                            {f.statement}{cite(f.claimIds)}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-[12px] text-muted">No finding for this question.</p>}
                  </div>
                );
              })}
              {r.contradictions.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold"><AlertTriangle className="size-4 text-warning" /> Contradictions</h3>
                  <ul className="mt-2 space-y-2">{r.contradictions.map((c, i) => <li key={i} className="text-[13px] text-muted">{c.explanation}{cite(c.claimIds)}</li>)}</ul>
                </div>
              )}
              {r.opportunities.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold">Opportunity hypotheses</h3>
                  <p className="text-[11px] text-muted">Hypotheses to test, not conclusions.</p>
                  <ul className="mt-3 grid gap-3 md:grid-cols-2">
                    {r.opportunities.map((o, i) => (
                      <li key={i} className="cc-lift rounded-cc border border-line p-4">
                        <div className="flex items-start justify-between gap-2"><p className="font-medium">{o.title}</p>{o.exploratory && <Badge tone="peach">exploratory</Badge>}</div>
                        <p className="mt-1 text-[13px] leading-relaxed">{o.thesis}</p>
                        <p className="mt-2 text-[12px] text-muted">Support{cite(o.supportingClaimIds)}{o.counterClaimIds.length ? <> · Against{cite(o.counterClaimIds)}</> : null}</p>
                        {o.assumptions.length > 0 && <p className="mt-2 text-[12px]"><b className="font-medium">Assumes:</b> {o.assumptions.join("; ")}</p>}
                        {o.risks.length > 0 && <p className="mt-1 text-[12px]"><b className="font-medium">Risks:</b> {o.risks.join("; ")}</p>}
                        <p className="mt-1 text-[12px]"><b className="font-medium">Validate:</b> {o.validation}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(r.gaps.length > 0 || r.limitations.length > 0) && (
                <div className="rounded-cc-sm bg-ink/[0.03] p-4">
                  <h3 className="text-[13px] font-semibold">Gaps and limitations</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-muted">
                    {r.gaps.map((g, i) => <li key={`g${i}`}>{questions.find((q) => q.key === g.questionKey)?.text ?? g.questionKey}: {g.description}</li>)}
                    {r.limitations.map((l, i) => <li key={`l${i}`}>{l}</li>)}
                  </ul>
                </div>
              )}
              {deep.plan && (
                <details className="text-[12px] text-muted">
                  <summary className="cursor-pointer">How this was researched ({deep.plan.planner === "llm" ? "AI-planned" : "rule-planned"})</summary>
                  <p className="mt-2">Sources used: {deep.plan.providers.join(", ") || "none"}. {deep.plan.timeframe.label}{deep.plan.geography ? ` · ${deep.plan.geography}` : ""}.</p>
                  {deep.plan.skipped.length > 0 && <p className="mt-1">Not used: {deep.plan.skipped.map((s) => `${s.provider} (${s.reason})`).join("; ")}.</p>}
                  {deep.plan.notes.map((n, i) => <p key={i} className="mt-1">{n}</p>)}
                </details>
              )}
            </>
          )}
        </div>
      )}

      {tab === "sources" && <SourceList docs={deep.documents} />}

      {tab === "claims" && (
        <ul className="divide-y divide-line">
          {sourceClaims.length === 0 && <li className="p-5 text-[13px] text-muted">No claims were extracted.</li>}
          {sourceClaims.map((c) => <ClaimItem key={c.id} c={c} n={num.get(c.id)!} open={openClaim === c.id} onToggle={() => setOpenClaim(openClaim === c.id ? null : c.id)} docs={docById} question={questions.find((q) => q.key === c.questionKey)?.text ?? null} numOf={(id) => num.get(id)} />)}
        </ul>
      )}
    </section>
  );
}

function SourceList({ docs }: { docs: DocumentRow[] }) {
  if (!docs.length) return <p className="p-5 text-[13px] text-muted">No sources were retrieved.</p>;
  const groups = new Map<string, number>();
  docs.forEach((d) => d.group && groups.set(d.group, (groups.get(d.group) ?? 0) + 1));
  return (
    <ul className="cc-stagger divide-y divide-line">
      {docs.map((d) => (
        <li key={d.id} className="p-4 text-[13px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:text-violet">{d.title} <ExternalLink className="inline size-3" /></a> : <span className="font-medium"><FileText className="mr-1 inline size-3.5" />{d.title}</span>}
              <p className="mt-0.5 text-[11px] text-muted">
                {[d.publisher, d.publishedAt ? `published ${new Date(d.publishedAt).toLocaleDateString()}` : "date unknown", `via ${d.provider}`, d.sourceType.replace("_", " ")].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {d.isDemo && <Badge tone="peach">demo</Badge>}
              <Badge tone="outline">{d.extraction === "extracted" ? "full text" : d.extraction === "snippet" ? "snippet only" : d.extraction.replace(/_/g, " ")}</Badge>
              {d.group && (groups.get(d.group) ?? 0) > 1 && <Badge tone="warning" title="Near-identical content (e.g. a syndicated press release) — counted as one independent source">same story ×{groups.get(d.group)}</Badge>}
            </div>
          </div>
          {Object.keys(d.metrics).length > 0 && <p className="mt-1 text-[11px] text-muted">Reported by the platform: {Object.entries(d.metrics).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ")}</p>}
          {d.restrictions && <p className="mt-1 text-[11px] text-faint">{d.restrictions}</p>}
        </li>
      ))}
    </ul>
  );
}

function ClaimItem({ c, n, open, onToggle, docs, question, numOf }: { c: ClaimRow; n: number; open: boolean; onToggle: () => void; docs: Map<string, DocumentRow>; question: string | null; numOf: (id: string) => number | undefined }) {
  const q = c.quality;
  return (
    <li id={`claim-${c.id}`} className={cn("transition-colors duration-500", open && "bg-lilac/20")}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open}>
        <span className="mt-0.5 rounded-full bg-lilac/60 px-1.5 font-mono text-[10px] text-violet-ink">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-relaxed">{c.text}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
            <span>{CLAIM_LABEL[c.claimType] ?? c.claimType}</span>
            {q && <span>· quality {q.score.toFixed(2)}</span>}
            {c.independent != null && <span>· {c.independent} independent source{c.independent === 1 ? "" : "s"}</span>}
            {c.contradicts.length > 0 && <span className="text-warning">· contradicted by {c.contradicts.map((id) => numOf(id)).filter(Boolean).join(", ")}</span>}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <div className="cc-animate-in space-y-3 px-4 pb-4 pl-12 text-[12px]">
          {question && <p className="text-muted">Answers: {question}</p>}
          {c.excerpt ? <blockquote className="border-l-2 border-violet pl-3 italic">“{c.excerpt}”</blockquote> : <p className="text-muted">No verbatim excerpt.</p>}
          <div>
            <p className="font-medium">Sources</p>
            <ul className="mt-1 space-y-1">
              {c.documentIds.map((id) => docs.get(id)).filter(Boolean).map((d) => (
                <li key={d!.id}>{d!.url ? <a href={d!.url} target="_blank" rel="noopener noreferrer nofollow" className="text-violet hover:underline">{d!.title}</a> : d!.title} <span className="text-muted">· {d!.publisher ?? d!.provider}{d!.publishedAt ? ` · ${new Date(d!.publishedAt).toLocaleDateString()}` : ""} · retrieved <When value={d!.retrievedAt} /></span></li>
              ))}
            </ul>
          </div>
          {q && (
            <div>
              <p className="font-medium">Why this quality score <span className="font-normal text-muted">(a ranking aid, not a probability)</span></p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
                {(["relevance", "credibility", "directness", "recency", "geography", "corroboration", "completeness"] as const).map((k) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="capitalize text-muted">{k}</dt><dd className="tabular-nums">{Number(q[k] ?? 0).toFixed(2)}</dd></div>
                ))}
              </dl>
              {q.notes?.length ? <p className="mt-1 text-muted">{q.notes.join(" ")}</p> : null}
            </div>
          )}
          <p className="text-muted">Extraction: {c.method ?? "—"} · Review: {c.review}{c.limitations ? ` · ${c.limitations}` : ""}</p>
        </div>
      )}
    </li>
  );
}
