import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Comments } from "@/components/evidence/comments";
import { ExperimentForm } from "@/components/experiments/experiment-form";
import { AddVariantForm, ImportCsvForm, InterpretationForm, RecordResultForm } from "@/components/experiments/results";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { isUuid } from "@/lib/data/projects";
import { compareArms, MIN_EXPOSURES, type Arm, type Comparison } from "@/lib/experiments/stats";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Experiment" };

export default async function ExperimentPage({ params }: PageProps<"/projects/[projectId]/experiments/[experimentId]">) {
  const { projectId, experimentId } = await params;
  if (!isUuid(experimentId)) notFound();
  const { ctx } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, async (tx) => {
    const [x] = await tx`select x.*, d.name as direction_name from experiments x left join strategy_directions d on d.id = x.direction_id where x.id = ${experimentId} and x.project_id = ${projectId}`;
    if (!x) return null;
    return {
      x,
      variants: await tx`select * from experiment_variants where experiment_id = ${experimentId} order by is_control desc, created_at`,
      results: await tx`select r.*, v.label, coalesce(p.full_name, p.email) as recorder from experiment_results r left join experiment_variants v on v.id = r.variant_id left join profiles p on p.id = r.recorded_by where r.experiment_id = ${experimentId} order by r.created_at`,
      dirs: await tx`select distinct on (version_id, slot) id, name from strategy_directions where project_id = ${projectId} and status <> 'superseded' order by version_id desc, slot, revision desc`,
      comments: await tx`select c.id, c.body, c.created_at, coalesce(p.full_name, p.email) as author from comments c left join profiles p on p.id = c.author_id where c.target_type = 'experiment' and c.target_id = ${experimentId} order by c.created_at`,
    };
  });
  if (!data) notFound();
  const { x, variants, results, dirs, comments } = data;
  const canEdit = can(ctx.workspace.role, "experiment.edit");
  const metrics = [x.primary_metric, ...(x.secondary_metrics as string[])];
  const primary = results.filter((r) => r.metric === x.primary_metric && r.variant_id);
  const max = Math.max(...primary.map((r) => Math.abs(Number(r.value))), 0);
  const randomised = /random|a\/b|split/i.test(x.method ?? "");
  // Rate results on the primary metric, summed per variant, compared with the control.
  const arms = new Map<string, Arm & { control: boolean }>();
  for (const r of results.filter((r) => r.metric === x.primary_metric && r.variant_id && r.successes !== null && r.sample_size)) {
    const v = variants.find((vv) => vv.id === r.variant_id);
    const a = arms.get(r.variant_id) ?? { label: r.label as string, successes: 0, exposures: 0, control: Boolean(v?.is_control) };
    a.successes += Number(r.successes);
    a.exposures += Number(r.sample_size);
    arms.set(r.variant_id, a);
  }
  const control = [...arms.values()].find((a) => a.control);
  const comparisons: Comparison[] = control ? [...arms.values()].filter((a) => a !== control).map((a) => compareArms(control, a)) : [];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap gap-2"><Badge tone="violet">{x.status}</Badge>{x.direction_name && <Badge tone="outline">{x.direction_name}</Badge>}<Badge tone="peach">Hypothesis — untested until results are recorded</Badge></div>
          <h1 className="cc-display mt-4 text-5xl">{x.name}</h1>
          <p className="mt-4 font-serif text-[26px] leading-snug">“{x.hypothesis}”</p>
          {x.rationale && <p className="mt-3 text-[14px] text-muted">{x.rationale}</p>}
        </div>

        <Surface className="p-6">
          <h2 className="cc-eyebrow text-muted">Plan</h2>
          <dl className="mt-4 grid gap-4 text-[13px] sm:grid-cols-2">
            {[["Audience", x.audience], ["Method", x.method], ["Primary metric (planned)", x.primary_metric], ["Secondary metrics (planned)", (x.secondary_metrics as string[]).join(", ")], ["Budget assumptions", x.budget_assumptions], ["Timeline", x.timeline], ["Decision threshold", x.decision_threshold]].map(([k, v]) => (
              <div key={k as string}><dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt><dd className="mt-1">{v || <span className="text-faint">Not set</span>}</dd></div>
            ))}
          </dl>
          <div className="mt-5">
            <h3 className="text-[12px] font-medium">Variants</h3>
            <ul className="mt-2 flex flex-wrap gap-2">{variants.map((v) => <li key={v.id}><Badge tone={v.is_control ? "dark" : "outline"}>{v.label}{v.is_control ? " · control" : ""}</Badge></li>)}</ul>
            {canEdit && <div className="mt-3 max-w-sm"><AddVariantForm experimentId={experimentId} /></div>}
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="cc-eyebrow text-muted">Observed results</h2>
          {results.length === 0 ? <p className="mt-3 text-[13px] text-muted">No results recorded. Nothing about this hypothesis is known yet.</p> : (
            <>
              {comparisons.length > 0 && <ResultsReading comparisons={comparisons} metric={x.primary_metric} threshold={x.decision_threshold} />}
              {arms.size > 0 && !control && <p className="mt-3 rounded-cc-sm bg-ivory p-3 text-[12px] text-muted">Mark one variant as the control to compare the others against it.</p>}
              {primary.length > 0 && max > 0 && comparisons.length === 0 && (
                <figure className="mt-4" aria-label={`${x.primary_metric} by variant`}>
                  <figcaption className="mb-2 text-[12px] text-muted">{x.primary_metric} by variant (observed)</figcaption>
                  <ul className="space-y-2">
                    {primary.map((r) => (
                      <li key={r.id} className="grid grid-cols-[140px_1fr_80px] items-center gap-3 text-[12px]">
                        <span className="truncate">{r.label}</span>
                        <span className="h-3 rounded-full bg-ink/5"><span className="block h-3 rounded-full bg-violet" style={{ width: `${(Math.abs(Number(r.value)) / max) * 100}%` }} /></span>
                        <span className="text-right tabular-nums">{Number(r.value)}</span>
                      </li>
                    ))}
                  </ul>
                </figure>
              )}
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12px]">
                  <thead className="text-muted"><tr><th className="py-1.5 font-medium">Variant</th><th className="font-medium">Metric</th><th className="text-right font-medium">Value</th><th className="text-right font-medium">n</th><th className="font-medium">Observed</th><th className="font-medium">Recorded by</th></tr></thead>
                  <tbody>{results.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5">{r.label ?? "Whole experiment"}</td><td>{r.metric}</td><td className="text-right tabular-nums">{Number(r.value)}</td><td className="text-right tabular-nums">{r.sample_size ?? "—"}</td><td>{r.observed_on ? formatDate(r.observed_on) : "—"}</td><td className="text-muted">{r.recorder} · {formatDateTime(r.created_at)}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="mt-3 rounded-cc-sm bg-ivory p-3 text-[12px] text-muted">
                {randomised ? "The stated method suggests randomisation; causal conclusions still depend on sample size, execution and pre-registered thresholds." : "The stated method is not a randomised comparison, so differences between variants should not be read as proof of causation."}
              </p>
            </>
          )}
          {canEdit && (
            <div className="mt-6 space-y-5 border-t border-line pt-5">
              <div><h3 className="mb-2 text-[13px] font-medium">Import from an ad platform</h3><ImportCsvForm experimentId={experimentId} variants={variants.map((v) => v.label)} /></div>
              <div><h3 className="mb-3 text-[13px] font-medium">Record a result by hand</h3><RecordResultForm experimentId={experimentId} variants={variants.map((v) => ({ id: v.id, label: v.label }))} metrics={metrics} /></div>
            </div>
          )}
        </Surface>
      </div>
      <div className="space-y-6">
        <Surface className="p-6">
          <h2 className="cc-eyebrow mb-4 text-muted">Interpretation & next step</h2>
          {canEdit ? <InterpretationForm experimentId={experimentId} interpretation={x.interpretation ?? ""} nextAction={x.next_action ?? ""} completed={x.status === "completed"} /> : <p className="text-[13px]">{x.interpretation ?? "No interpretation yet."}</p>}
        </Surface>
        {canEdit && (
          <Surface className="p-6">
            <details>
              <summary className="cursor-pointer text-[13px] font-medium">Edit experiment design</summary>
              {x.design_locked_at && <p className="mt-3 rounded-cc-sm bg-ivory p-3 text-[12px] text-muted">Locked since the first result ({formatDate(x.design_locked_at)}): the hypothesis, method, primary metric and decision threshold can no longer change, so results can&rsquo;t rewrite the question. Name, timeline and status can still be edited.</p>}
              <div className="mt-4">
                <ExperimentForm projectId={projectId} experimentId={experimentId} directions={dirs.map((d) => ({ id: d.id, name: d.name }))} initial={{
                  name: x.name, hypothesis: x.hypothesis, rationale: x.rationale ?? "", directionId: x.direction_id ?? "", audience: x.audience ?? "", method: x.method ?? "", primaryMetric: x.primary_metric,
                  secondaryMetrics: (x.secondary_metrics as string[]).join(", "), budgetAssumptions: x.budget_assumptions ?? "", timeline: x.timeline ?? "", decisionThreshold: x.decision_threshold ?? "", status: x.status,
                }} />
              </div>
            </details>
          </Surface>
        )}
        <Surface className="p-6"><Comments projectId={projectId} targetType="experiment" targetId={experimentId} path={`/projects/${projectId}/experiments/${experimentId}`} canComment={can(ctx.workspace.role, "comment.create")} comments={comments.map((c) => ({ id: c.id, body: c.body, author: c.author ?? "Someone", createdAt: new Date(c.created_at).toISOString() }))} /></Surface>
      </div>
    </div>
  );
}

const VERDICT_LABEL: Record<Comparison["verdict"], { label: string; tone: "success" | "danger" | "outline" | "peach" }> = {
  variant_better: { label: "Variant ahead", tone: "success" },
  variant_worse: { label: "Variant behind", tone: "danger" },
  no_clear_difference: { label: "No clear difference yet", tone: "outline" },
  too_little_data: { label: "Too little data", tone: "peach" },
};
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const pts = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} pts`;

/** What the recorded rates say, variant by variant against the control, in plain words. */
function ResultsReading({ comparisons, metric, threshold }: { comparisons: Comparison[]; metric: string; threshold: string | null }) {
  return (
    <section className="mt-4 space-y-3" aria-label="What the results say">
      <h3 className="text-[13px] font-medium">What the results say · {metric}</h3>
      {comparisons.map((c) => (
        <div key={c.variant} className="rounded-cc-md border border-line bg-paper p-4 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{c.variant} <span className="font-normal text-muted">vs {c.control}</span></p>
            <Badge tone={VERDICT_LABEL[c.verdict].tone}>{VERDICT_LABEL[c.verdict].label}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
            <div><dt className="text-muted">Control rate</dt><dd className="tabular-nums">{pct(c.controlRate)}</dd></div>
            <div><dt className="text-muted">Variant rate</dt><dd className="tabular-nums">{pct(c.variantRate)}</dd></div>
            <div><dt className="text-muted">Difference (95% range)</dt><dd className="tabular-nums">{pts(c.difference)} <span className="text-muted">({pts(c.ci95[0])} to {pts(c.ci95[1])})</span></dd></div>
            <div><dt className="text-muted">Relative lift</dt><dd className="tabular-nums">{c.lift === null ? "—" : `${c.lift >= 0 ? "+" : ""}${(c.lift * 100).toFixed(1)}%`}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">{c.reason}</p>
        </div>
      ))}
      <p className="text-[11px] text-faint">Two-sided two-proportion test at 95% confidence; a comparison is only called once each group has at least {MIN_EXPOSURES} exposures and 10 successes and failures.{threshold ? ` Your pre-agreed decision rule: “${threshold}”.` : ""}</p>
    </section>
  );
}
