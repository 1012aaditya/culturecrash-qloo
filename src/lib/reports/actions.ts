"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { buildSnapshot } from "./snapshot";
import { hashToken } from "./token";
import { REPORT_SECTIONS, type ReportSectionKey } from "./types";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const sectionsSchema = z.array(z.enum(REPORT_SECTIONS.map(([k]) => k) as [ReportSectionKey, ...ReportSectionKey[]])).min(1, "Choose at least one section");

export async function createReportAction(projectId: string, title: string, sections: string[]): Promise<R<{ id: string }>> {
  const s = sectionsSchema.safeParse(sections);
  const t = title.trim();
  if (!isUuid(projectId) || !s.success || t.length < 1 || t.length > 200) return { ok: false, error: "Give the report a title and at least one section." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "report.create");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const ordered = REPORT_SECTIONS.map(([k]) => k).filter((k) => s.data.includes(k));
  const id = await withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select id from projects where id = ${projectId}`;
    if (!p) return null;
    const snapshot = await buildSnapshot(tx, projectId, ordered, t);
    const [r] = await tx`insert into reports (project_id, workspace_id, title, created_by) values (${projectId}, ${ctx.workspace.workspaceId}, ${t}, ${ctx.user.id}) returning id`;
    await tx`insert into report_versions (report_id, workspace_id, version, sections, snapshot, run_id, strategy_version_id, contains_demo_data, created_by)
      values (${r.id}, ${ctx.workspace.workspaceId}, 1, ${ordered}, ${tx.json(snapshot as never)}, ${snapshot.refs.runId}, ${snapshot.refs.strategyVersionId}, ${snapshot.containsDemoData}, ${ctx.user.id})`;
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "created", objectType: "report", objectId: r.id, summary: `generated report “${t}”` });
    return r.id as string;
  });
  if (!id) return { ok: false, error: "Project not found." };
  revalidatePath(`/projects/${projectId}/reports`);
  return { ok: true, data: { id } };
}

/** New immutable version: re-snapshots current project state; earlier versions are untouched. */
export async function createReportVersionAction(reportId: string, sections: string[]): Promise<R<{ version: number }>> {
  const s = sectionsSchema.safeParse(sections);
  if (!isUuid(reportId) || !s.success) return { ok: false, error: "Choose at least one section." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "report.create");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const ordered = REPORT_SECTIONS.map(([k]) => k).filter((k) => s.data.includes(k));
  const out = await withUser(ctx.user.id, async (tx) => {
    const [r] = await tx`select id, project_id, title from reports where id = ${reportId}`;
    if (!r) return null;
    const snapshot = await buildSnapshot(tx, r.project_id, ordered, r.title);
    const [{ v }] = await tx`select coalesce(max(version), 0) + 1 as v from report_versions where report_id = ${reportId}`;
    await tx`insert into report_versions (report_id, workspace_id, version, sections, snapshot, run_id, strategy_version_id, contains_demo_data, created_by)
      values (${reportId}, ${ctx.workspace.workspaceId}, ${v}, ${ordered}, ${tx.json(snapshot as never)}, ${snapshot.refs.runId}, ${snapshot.refs.strategyVersionId}, ${snapshot.containsDemoData}, ${ctx.user.id})`;
    await tx`update reports set updated_at = now() where id = ${reportId}`;
    return { version: v as number, projectId: r.project_id as string };
  });
  if (!out) return { ok: false, error: "Report not found." };
  revalidatePath(`/projects/${out.projectId}/reports/${reportId}`);
  return { ok: true, data: { version: out.version } };
}

export async function createShareLinkAction(reportVersionId: string, label: string, expiresInDays: number | null): Promise<R<{ url: string }>> {
  if (!isUuid(reportVersionId) || label.length > 120 || (expiresInDays !== null && (expiresInDays < 1 || expiresInDays > 365))) return { ok: false, error: "Invalid sharing options." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "report.share");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  // The raw token is shown once and never stored; only its SHA-256 hash is persisted.
  const token = randomBytes(32).toString("base64url");
  const ok = await withUser(ctx.user.id, async (tx) => {
    const [v] = await tx`select v.id, r.project_id, r.title from report_versions v join reports r on r.id = v.report_id where v.id = ${reportVersionId}`;
    if (!v) return false;
    await tx`insert into shared_report_links (report_version_id, workspace_id, token_hash, label, expires_at, created_by)
      values (${reportVersionId}, ${ctx.workspace.workspaceId}, ${hashToken(token)}, ${label.trim() || null},
        ${expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null}, ${ctx.user.id})`;
    await trackEvent(tx, { workspaceId: ctx.workspace.workspaceId, userId: ctx.user.id, event: "report_shared", projectId: v.project_id });
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId: v.project_id, verb: "shared", objectType: "report", objectId: reportVersionId, summary: `created a read-only link for “${v.title}”` });
    return true;
  });
  if (!ok) return { ok: false, error: "Report version not found." };
  return { ok: true, data: { url: `${env().APP_BASE_URL}/reports/shared/${token}` } };
}

export async function revokeShareLinkAction(linkId: string): Promise<R> {
  if (!isUuid(linkId)) return { ok: false, error: "Invalid link." };
  const ctx = await getCtx();
  const n = await withUser(ctx.user.id, async (tx) => (await tx`update shared_report_links set revoked_at = now() where id = ${linkId} and revoked_at is null returning id`).length);
  if (!n) return { ok: false, error: "Link not found, already revoked, or you cannot revoke it." };
  return { ok: true };
}
