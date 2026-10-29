import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { NewReport } from "@/components/reports/report-controls";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params, searchParams }: PageProps<"/projects/[projectId]/reports">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx, project } = await getProjectContext(projectId);
  const reports = await withUser(ctx.user.id, (tx) => tx`select r.id, r.title, r.updated_at, coalesce(p.full_name, p.email) as author,
    (select max(version) from report_versions v where v.report_id = r.id) as versions,
    (select bool_or(contains_demo_data) from report_versions v where v.report_id = r.id) as demo,
    (select count(*) from shared_report_links l join report_versions v on v.id = l.report_version_id where v.report_id = r.id and l.revoked_at is null and (l.expires_at is null or l.expires_at > now()))::int as shares
    from reports r left join profiles p on p.id = r.created_by where r.project_id = ${projectId} order by r.updated_at desc`);
  const canCreate = can(ctx.workspace.role, "report.create");
  return (
    <div>
      <div className="mb-10 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div><p className="cc-eyebrow text-muted">05 · Track · Reports</p><h1 className="cc-display mt-3 text-5xl md:text-6xl">Deliverables with their working shown.</h1></div>
        <div className="space-y-3 md:justify-self-end">
          <p className="max-w-md text-[14px] text-muted">Every report is a versioned snapshot tied to the research run and strategy version it was built from.</p>
          {canCreate && <NewReport projectId={projectId} defaultTitle={`${project.name} — cultural strategy`} defaultOpen={sp.new === "1"} />}
        </div>
      </div>
      {reports.length === 0 ? <EmptyState icon={FileText} title="No reports yet" body="Generate a report to package the brief, research, opportunities, strategy and experiment plan with citations." /> : (
        <ul className="grid gap-4 md:grid-cols-3">
          {reports.map((r, i) => (
            <li key={r.id} className={cn(i === 0 && "md:col-span-2 md:row-span-2")}>
              <Link href={`/projects/${projectId}/reports/${r.id}`} className={cn("flex h-full flex-col justify-between rounded-[28px] border border-line p-6 cc-lift", i === 0 ? "min-h-[320px] bg-charcoal text-white" : "bg-paper")}>
                <div className="flex flex-wrap gap-1.5"><Badge tone={i === 0 ? "glass" : "outline"}>v{r.versions}</Badge>{r.shares > 0 && <Badge tone={i === 0 ? "glass" : "violet"}>shared · {r.shares}</Badge>}{r.demo && <DemoBadge label="Demo" />}</div>
                <div className="mt-10"><h2 className={cn("cc-display", i === 0 ? "text-5xl" : "text-3xl")}>{r.title}</h2><p className={cn("mt-2 text-[12px]", i === 0 ? "text-white/60" : "text-muted")}>{r.author} · updated {formatDateTime(r.updated_at)}</p></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
