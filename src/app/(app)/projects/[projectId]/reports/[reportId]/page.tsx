import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { NewVersion, ShareDialog } from "@/components/reports/report-controls";
import { ReportDocument } from "@/components/reports/report-document";
import { Button } from "@/components/ui/button";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { isUuid } from "@/lib/data/projects";
import { can } from "@/lib/permissions";
import type { ReportSnapshot } from "@/lib/reports/types";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: PageProps<"/projects/[projectId]/reports/[reportId]">) {
  const { projectId, reportId } = await params;
  const sp = await searchParams;
  if (!isUuid(reportId)) notFound();
  const { ctx } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, async (tx) => {
    const [r] = await tx`select * from reports where id = ${reportId} and project_id = ${projectId}`;
    if (!r) return null;
    const versions = await tx`select id, version, sections, snapshot, created_at, contains_demo_data from report_versions where report_id = ${reportId} order by version desc`;
    const links = await tx`select l.*, v.version, coalesce(p.full_name, p.email) as creator from shared_report_links l join report_versions v on v.id = l.report_version_id
      left join profiles p on p.id = l.created_by where v.report_id = ${reportId} order by l.created_at desc`;
    const [latestRun] = await tx`select id from research_runs where project_id = ${projectId} and status = 'completed' order by created_at desc limit 1`;
    return { r, versions, links, latestRunId: latestRun?.id ?? null };
  });
  if (!data) notFound();
  const want = Number(sp.v) || null;
  const v = data.versions.find((x) => x.version === want) ?? data.versions[0];
  const snap = v.snapshot as ReportSnapshot;
  const stale = data.latestRunId && snap.refs.runId !== data.latestRunId;
  return (
    <div>
      <div className="cc-no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Report versions" className="flex flex-wrap gap-1.5">
          {data.versions.map((x) => (
            <Link key={x.id} href={`?v=${x.version}`} className={cn("rounded-full border px-3 py-1.5 text-[12px]", x.id === v.id ? "border-ink bg-ink text-white" : "border-line bg-paper hover:bg-ivory")}>v{x.version} · {formatDateTime(x.created_at)}</Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <NewVersion reportId={reportId} current={v.sections} canCreate={can(ctx.workspace.role, "report.create")} />
          <ShareDialog reportVersionId={v.id} version={v.version} canShare={can(ctx.workspace.role, "report.share")} defaultOpen={sp.share === "1"}
            links={data.links.map((l) => ({ id: l.id, label: l.label, expiresAt: l.expires_at ? new Date(l.expires_at).toISOString() : null, revokedAt: l.revoked_at ? new Date(l.revoked_at).toISOString() : null, accessCount: l.access_count, lastAccessedAt: l.last_accessed_at ? new Date(l.last_accessed_at).toISOString() : null, createdAt: new Date(l.created_at).toISOString(), createdBy: l.creator ?? "—", version: l.version }))} />
          <Button asChild size="sm"><a href={`/api/reports/${reportId}/pdf?v=${v.version}`}><Download /> PDF</a></Button>
        </div>
      </div>
      {stale && <p className="cc-no-print mb-4 rounded-cc-sm bg-warning/10 p-3 text-[13px] text-warning">Research has changed since this version was created. This version is unchanged; create a new version to include the latest run.</p>}
      <ReportDocument s={snap} version={v.version} createdAt={new Date(v.created_at).toISOString()} />
    </div>
  );
}
