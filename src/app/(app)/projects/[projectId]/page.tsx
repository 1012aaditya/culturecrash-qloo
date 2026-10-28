import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, Surface } from "@/components/ui/surface";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { STAGES, stageHref } from "@/lib/stages";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaign" };

export default async function ProjectOverview({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { ctx, project, stages } = await getProjectContext(projectId);
  const activity = await withUser(ctx.user.id, (tx) => tx`
    select a.summary, a.created_at, coalesce(p.full_name, p.email) as actor from activity_events a left join profiles p on p.id = a.actor_id
    where a.project_id = ${projectId} order by a.created_at desc limit 8`);
  const next = STAGES.find((s) => stages[s.key].state !== "done") ?? STAGES[4];
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <section className="relative min-h-[420px] overflow-hidden rounded-[36px] bg-charcoal text-white lg:col-span-7">
        <ArtPlate theme={themeForCategory(project.category)} seed={project.id} rounded={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/90 via-charcoal/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-8 md:p-10">
          <p className="cc-eyebrow text-white/60">Project · {project.clientName ?? "Internal"}</p>
          <div>
            <h1 className="cc-display text-6xl md:text-7xl">{project.name}</h1>
            <p className="mt-3 text-white/70">{[project.category, project.market].filter(Boolean).join(" · ") || "Category and market not set"}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="inverse"><Link href={stageHref(project.id, next.key)}>Continue: {next.label} <ArrowRight /></Link></Button>
              <Button asChild variant="ghost-dark"><Link href={`/projects/${project.id}/brief`}>Edit brief</Link></Button>
            </div>
          </div>
        </div>
      </section>
      <Surface className="p-6 lg:col-span-5">
        <SectionTitle eyebrow="Workflow" title="Where this campaign stands" />
        <ol className="mt-4 space-y-2">
          {STAGES.map((s) => {
            const st = stages[s.key];
            return (
              <li key={s.key}>
                <Link href={stageHref(project.id, s.key)} className="flex items-center gap-3 rounded-cc-sm border border-line p-3 hover:bg-ivory">
                  <span className={cn("flex size-7 items-center justify-center rounded-full font-mono text-[10px]", st.state === "done" ? "bg-violet text-white" : st.state === "partial" ? "bg-lilac text-violet-ink" : "bg-ink/5 text-muted")}>
                    {st.state === "done" ? <Check className="size-3.5" /> : s.number}
                  </span>
                  <span className="flex-1"><span className="block text-[14px] font-medium">{s.label}</span><span className="text-[12px] text-muted">{st.state === "done" ? "Complete" : st.missing ?? "In progress"}</span></span>
                  <ArrowRight className="size-4 text-faint" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Surface>
      <Surface className="p-6 lg:col-span-4">
        <SectionTitle eyebrow="Records" title="What has been saved" />
        <dl className="mt-4 grid grid-cols-2 gap-4 text-[13px]">
          {[
            ["Brief fields", `${project.briefFilled} of 6 core`],
            ["Evidence items", project.evidenceCount],
            ["Opportunities", project.opportunityCount],
            ["Strategy versions", project.strategyCount],
            ["Experiments", project.experimentCount],
            ["Reports", project.reportCount],
          ].map(([k, v]) => (
            <div key={k as string}><dt className="text-muted">{k}</dt><dd className="mt-0.5 text-xl font-medium tracking-tight">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] text-faint">Created {formatDate(project.createdAt)} · updated {timeAgo(project.updatedAt)}</p>
      </Surface>
      <Surface className="p-6 lg:col-span-8">
        <SectionTitle eyebrow="History" title="Recent activity" />
        {activity.length === 0 ? <p className="mt-4 text-[13px] text-muted">No activity yet.</p> : (
          <ul className="mt-4 divide-y divide-line">
            {activity.map((a, i) => (
              <li key={i} className="flex justify-between gap-4 py-2.5 text-[13px]"><span><b className="font-medium">{a.actor}</b> <span className="text-muted">{a.summary}</span></span><Badge tone="outline">{timeAgo(a.created_at)}</Badge></li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
