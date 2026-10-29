import "server-only";
import { withUser } from "@/lib/db";
import { sendEmail } from "./index";
import { reportSharedEmail, researchFinishedEmail } from "./templates";

/** Notification emails respect each recipient's own preferences (off unless they opted in). */
type Prefs = Record<string, unknown> | null;
const wants = (prefs: Prefs, key: string) => prefs?.[key] === true;

export async function notifyResearchFinished(userId: string, runId: string) {
  const row = await withUser(userId, async (tx) => {
    const [r] = await tx`
      select r.status, r.mode, r.error_message, r.project_id, p.name as project, pr.email, pr.notification_prefs,
        (select count(*)::int from cultural_entities e where e.run_id = r.id and e.role <> 'seed') as entities
      from research_runs r join projects p on p.id = r.project_id join profiles pr on pr.id = ${userId}
      where r.id = ${runId}`;
    return r;
  });
  if (!row || !["completed", "failed"].includes(row.status) || !row.email || !wants(row.notification_prefs, "research_completed")) return;
  await sendEmail(researchFinishedEmail({
    to: row.email, project: row.project, projectId: row.project_id, runId, ok: row.status === "completed",
    entities: row.entities, error: row.error_message, demo: row.mode === "demo",
  }));
}

export async function notifyReportShared(sharerId: string, sharerName: string, reportVersionId: string) {
  const row = await withUser(sharerId, async (tx) => {
    const [r] = await tx`
      select r.title, p.id as project_id, p.name as project, p.owner_id, o.email, o.notification_prefs
      from report_versions v join reports r on r.id = v.report_id join projects p on p.id = r.project_id
      left join profiles o on o.id = p.owner_id
      where v.id = ${reportVersionId}`;
    return r;
  });
  if (!row || !row.owner_id || row.owner_id === sharerId || !row.email || !wants(row.notification_prefs, "report_shared")) return;
  await sendEmail(reportSharedEmail({ to: row.email, sharer: sharerName, project: row.project, projectId: row.project_id, report: row.title }));
}
