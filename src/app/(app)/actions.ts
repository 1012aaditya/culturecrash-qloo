"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity, trackEvent } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { getCtx, WORKSPACE_COOKIE } from "@/lib/data/workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  console.error("[action]", error instanceof Error ? error.message : error);
  return { ok: false, error: "Something went wrong while saving. Your changes were not applied." };
}

export async function switchWorkspaceAction(form: FormData) {
  const ctx = await getCtx();
  const id = String(form.get("workspaceId") ?? "");
  if (!ctx.memberships.some((m) => m.workspaceId === id)) return;
  (await cookies()).set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name").max(160),
  clientId: z.string().optional().transform((v) => (v && isUuid(v) ? v : null)),
  newClientName: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(160).optional(),
  category: z.string().trim().max(120).optional(),
  market: z.string().trim().max(160).optional(),
});

export async function createProjectAction(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const ctx = await getCtx();
  let projectId: string;
  try {
    assertCan(ctx.workspace.role, "project.create");
    const d = parsed.data;
    const ws = ctx.workspace.workspaceId;
    projectId = await withUser(ctx.user.id, async (tx) => {
      let clientId = d.clientId;
      if (!clientId && d.newClientName) {
        const [c] = await tx`insert into clients (workspace_id, name, created_by) values (${ws}, ${d.newClientName}, ${ctx.user.id}) returning id`;
        clientId = c.id;
      }
      const [p] = await tx`
        insert into projects (workspace_id, client_id, name, category, market, owner_id)
        values (${ws}, ${clientId}, ${d.name}, ${d.category || null}, ${d.market || null}, ${ctx.user.id}) returning id`;
      await tx`insert into campaign_briefs (project_id, workspace_id, brand, category, market, updated_by)
        values (${p.id}, ${ws}, ${d.brand || null}, ${d.category || null}, ${d.market || null}, ${ctx.user.id})`;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId: p.id, verb: "created", objectType: "project", objectId: p.id, summary: `created campaign “${d.name}”` });
      await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "project_created", projectId: p.id });
      return p.id as string;
    });
  } catch (e) {
    return fail(e);
  }
  redirect(`/projects/${projectId}/brief?new=1`);
}

export async function renameProjectAction(projectId: string, name: string): Promise<ActionResult> {
  const clean = name.trim();
  if (!isUuid(projectId) || clean.length < 1 || clean.length > 160) return { ok: false, error: "Enter a name between 1 and 160 characters." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "project.edit");
    const updated = await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update projects set name = ${clean} where id = ${projectId} and workspace_id = ${ctx.workspace.workspaceId} returning id`;
      if (rows.length) await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "renamed", objectType: "project", objectId: projectId, summary: `renamed a campaign to “${clean}”` });
      return rows.length;
    });
    if (!updated) return { ok: false, error: "Project not found." };
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function setProjectStatusAction(projectId: string, status: "active" | "archived" | "draft"): Promise<ActionResult> {
  if (!isUuid(projectId) || !["active", "archived", "draft"].includes(status)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "project.archive");
    await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update projects set status = ${status} where id = ${projectId} and workspace_id = ${ctx.workspace.workspaceId} returning name`;
      if (!rows.length) throw new Error("not found");
      await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: status === "archived" ? "archived" : "restored", objectType: "project", objectId: projectId, summary: `${status === "archived" ? "archived" : "restored"} “${rows[0].name}”` });
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProjectAction(projectId: string, confirmName: string): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    const result = await withUser(ctx.user.id, async (tx) => {
      const [p] = await tx`select name, owner_id from projects where id = ${projectId} and workspace_id = ${ctx.workspace.workspaceId}`;
      if (!p) return "missing";
      // Admins, or the project's owner, may delete. RLS enforces the same rule.
      if (p.owner_id !== ctx.user.id) assertCan(ctx.workspace.role, "project.delete");
      else assertCan(ctx.workspace.role, "project.edit");
      if (p.name !== confirmName.trim()) return "mismatch";
      const del = await tx`delete from projects where id = ${projectId} returning id`;
      if (!del.length) throw new ForbiddenError("project.delete");
      await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, verb: "deleted", objectType: "project", objectId: null, summary: `deleted campaign “${p.name}” and its research` });
      return "ok";
    });
    if (result === "missing") return { ok: false, error: "Project not found." };
    if (result === "mismatch") return { ok: false, error: "The name you typed does not match the campaign name." };
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function openDemoWorkspaceAction() {
  const { demoModeAllowed } = await import("@/lib/env");
  if (!demoModeAllowed()) return;
  const ctx = await getCtx();
  const ws = await withUser(ctx.user.id, async (tx) => (await tx`select create_demo_workspace() as id`)[0].id as string);
  (await cookies()).set(WORKSPACE_COOKIE, ws, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
