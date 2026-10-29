import "server-only";
import { withUser } from "@/lib/db";
import { createNotification } from "@/lib/data/notifications";
import { sendEmail } from "./index";
import { reportSharedEmail, researchFinishedEmail } from "./templates";

/** Notification emails respect each recipient's own preferences (off unless they opted in). */
type Prefs = Record<string, unknown> | null;
const wants = (prefs: Prefs, key: string) => prefs?.[key] === true;

export async function notifyResearchFinished(userId: string, runId: string) {
  const row = await withUser(userId, async (tx) => {
    const [r] = await tx`
      select r.status, r.mode, r.depth, r.error_message, r.project_id, r.workspace_id, p.name as project, pr.email, pr.notification_prefs,
        (r.usage->>'documents')::int as documents, (r.usage->>'claims')::int as claims,
        (select count(*)::int from cultural_entities e where e.run_id = r.id and e.role <> 'seed') as entities
      from research_runs r join projects p on p.id = r.project_id join profiles pr on pr.id = ${userId}
      where r.id = ${runId}`;
    if (r && ["completed", "partially_completed", "failed"].includes(r.status)) {
      const ok = r.status !== "failed";
      await createNotification(tx, {
        workspaceId: r.workspace_id, userId, actorId: null, kind: ok ? "research_completed" : "research_failed",
        title: ok ? `Research finished · ${r.project}` : `Research failed · ${r.project}`,
        body: !ok ? (r.error_message ?? "The run did not complete.")
          : `${r.depth ? `${r.documents ?? 0} sources, ${r.claims ?? 0} cited claims` : `${r.entities} entities and taste tags`}${r.status === "partially_completed" ? " — partial report" : ""}${r.mode === "demo" ? " (demonstration data)" : ""}.`,
        href: `/projects/${r.project_id}/research?run=${runId}`,
      });
    }
    return r;
  });
  if (!row || !["completed", "partially_completed", "failed"].includes(row.status) || !row.email || !wants(row.notification_prefs, "research_completed")) return;
  await sendEmail(researchFinishedEmail({
    to: row.email, project: row.project, projectId: row.project_id, runId, ok: row.status !== "failed",
    entities: row.entities, error: row.error_message, demo: row.mode === "demo",
  }));
}

export async function notifyReportShared(sharerId: string, sharerName: string, reportVersionId: string) {
  const row = await withUser(sharerId, async (tx) => {
    const [r] = await tx`
      select r.title, r.workspace_id, p.id as project_id, p.name as project, p.owner_id, o.email, o.notification_prefs
      from report_versions v join reports r on r.id = v.report_id join projects p on p.id = r.project_id
      left join profiles o on o.id = p.owner_id
      where v.id = ${reportVersionId}`;
    if (r?.owner_id && r.owner_id !== sharerId) {
      const [member] = await tx`select 1 from workspace_members where workspace_id = ${r.workspace_id} and user_id = ${r.owner_id}`;
      if (member) await createNotification(tx, {
        workspaceId: r.workspace_id, userId: r.owner_id, actorId: sharerId, kind: "report_shared",
        title: `${sharerName} shared “${r.title}”`, body: `A read-only link was created in ${r.project}.`, href: `/projects/${r.project_id}/reports`,
      });
    }
    return r;
  });
  if (!row || !row.owner_id || row.owner_id === sharerId || !row.email || !wants(row.notification_prefs, "report_shared")) return;
  await sendEmail(reportSharedEmail({ to: row.email, sharer: sharerName, project: row.project, projectId: row.project_id, report: row.title }));
}
