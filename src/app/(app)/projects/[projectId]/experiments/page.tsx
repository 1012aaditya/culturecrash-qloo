import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { NewExperiment } from "@/components/experiments/new-experiment";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import type { DirectionContent } from "@/lib/ai/schemas";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Experiments" };

const COLUMNS = [["draft", "Draft"], ["planned", "Planned"], ["running", "Running"], ["completed", "Completed"]] as const;

export default async function ExperimentsPage({ params, searchParams }: PageProps<"/projects/[projectId]/experiments">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, async (tx) => ({
    experiments: await tx`select x.*, d.name as direction_name,
      (select count(*) from experiment_variants v where v.experiment_id = x.id)::int as variant_count,
      (select count(*) from experiment_results r where r.experiment_id = x.id)::int as result_count
      from experiments x left join strategy_directions d on d.id = x.direction_id where x.project_id = ${projectId} order by x.updated_at desc`,
    dirs: await tx`select distinct on (version_id, slot) id, name, content, status from strategy_directions where project_id = ${projectId} and status <> 'superseded' order by version_id desc, slot, revision desc`,
  }));
  const selected = data.dirs.find((d) => d.status === "selected");
  const c = selected?.content as DirectionContent | undefined;
  const canEdit = can(ctx.workspace.role, "experiment.edit");
  const initial = {
    name: c ? `Test: ${selected!.name}` : "", hypothesis: c?.assumptionsToTest[0] ? `${c.assumptionsToTest[0]}` : "", rationale: c?.suggestedExperiment ?? "",
    directionId: selected?.id ?? "", audience: "", method: "", primaryMetric: "", secondaryMetrics: "", budgetAssumptions: "", timeline: "", decisionThreshold: "", status: "draft",
  };
  const cancelled = data.experiments.filter((x) => x.status === "cancelled");
  return (
    <div>
      <div className="mb-10 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="cc-eyebrow text-muted">04 · Test</p>
          <h1 className="cc-display mt-3 text-5xl md:text-6xl">Turn assumptions into evidence.</h1>
        </div>
        <div className="space-y-3 md:justify-self-end">
          <p className="max-w-md text-[14px] leading-relaxed text-muted">Plan fair tests for the riskiest assumptions. Planned metrics, observed results and interpretation stay separate.</p>
          {canEdit && <NewExperiment projectId={projectId} initial={initial} directions={data.dirs.map((d) => ({ id: d.id, name: d.name }))} defaultOpen={sp.new === "1"} />}
        </div>
      </div>
      {data.experiments.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No experiments yet" body={selected ? `The selected direction “${selected.name}” suggests: ${c?.suggestedExperiment}` : "Select a strategy direction to pre-fill a hypothesis from its assumptions, or design one from scratch."} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map(([key, label]) => {
            const list = data.experiments.filter((x) => x.status === key);
            return (
              <section key={key} aria-label={label} className={cn("rounded-[28px] p-3", key === "running" ? "bg-charcoal text-white" : "bg-ink/[0.03]")}>
                <h2 className="flex items-center justify-between px-2 py-2 text-[13px] font-medium">{label}<span className={cn("font-mono text-[11px]", key === "running" ? "text-white/50" : "text-muted")}>{list.length}</span></h2>
                <ul className="space-y-2">
                  {list.map((x) => (
                    <li key={x.id}>
                      <Link href={`/projects/${projectId}/experiments/${x.id}`} className={cn("block rounded-cc border p-4 cc-lift", key === "running" ? "border-white/10 bg-white/5" : "border-line bg-paper")}>
                        <p className="text-[14px] font-medium leading-snug">{x.name}</p>
                        <p className={cn("mt-1.5 line-clamp-3 text-[12px] leading-snug", key === "running" ? "text-white/65" : "text-muted")}>{x.hypothesis}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge tone={key === "running" ? "glass" : "outline"}>{x.primary_metric}</Badge>
                          <Badge tone={key === "running" ? "glass" : "outline"}>{x.variant_count} variants</Badge>
                          <Badge tone={x.result_count ? "success" : key === "running" ? "glass" : "outline"}>{x.result_count ? `${x.result_count} results` : "no results"}</Badge>
                        </div>
                        <p className={cn("mt-2 text-[11px]", key === "running" ? "text-white/45" : "text-faint")}>{x.direction_name ? `${x.direction_name} · ` : ""}{timeAgo(x.updated_at)}</p>
                      </Link>
                    </li>
                  ))}
                  {list.length === 0 && <li className={cn("px-2 py-4 text-[12px]", key === "running" ? "text-white/45" : "text-faint")}>Nothing here.</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {cancelled.length > 0 && <p className="mt-4 text-[12px] text-muted">{cancelled.length} cancelled: {cancelled.map((x) => <Link key={x.id} className="underline" href={`/projects/${projectId}/experiments/${x.id}`}>{x.name}</Link>)}</p>}
    </div>
  );
}
