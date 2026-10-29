"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { localDeleteAccount, localSignIn, localUpdatePassword } from "@/lib/auth/local";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseSignIn, supabaseUpdatePassword } from "@/lib/auth/supabase";
import { privilegedSql, withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { emailConfigured, sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email/templates";
import { assertCan, type Role } from "@/lib/permissions";
import { logActivity } from "./activity";
import { friendly, invalid, optText, type Result } from "./action-utils";
import { isUuid } from "./projects";
import { getCtx, WORKSPACE_COOKIE } from "./workspace";
import { NOTIFICATION_KEYS, soleOwnerBlockers } from "./workspace-admin";

// ---------------------------------------------------------------------------
// Profile & notifications (personal: no workspace permission involved)
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120, "Keep your name under 120 characters"),
  jobTitle: optText(120, "Job title"),
});

export async function updateProfileAction(input: z.input<typeof profileSchema>): Promise<Result> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  try {
    await withUser(ctx.user.id, (tx) => tx`update profiles set full_name = ${parsed.data.fullName}, job_title = ${parsed.data.jobTitle} where id = ${ctx.user.id}`);
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const prefsSchema = z.object(Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof NOTIFICATION_KEYS)[number], z.ZodBoolean>);

export async function updateNotificationsAction(input: Record<string, boolean>): Promise<Result> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid notification preferences." };
  const ctx = await getCtx();
  try {
    await withUser(ctx.user.id, (tx) => tx`update profiles set notification_prefs = notification_prefs || ${tx.json(parsed.data)} where id = ${ctx.user.id}`);
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/settings/notifications");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------
const workspaceName = z.string().trim().min(1, "Enter a workspace name").max(120, "Keep the name under 120 characters");

export async function renameWorkspaceAction(name: string): Promise<Result> {
  const parsed = workspaceName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: { name: parsed.error.issues[0].message } };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "workspace.manage");
    const ws = ctx.workspace.workspaceId;
    await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update workspaces set name = ${parsed.data} where id = ${ws} returning id`;
      if (!rows.length) throw Object.assign(new Error("forbidden"), { code: "42501" });
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "renamed", objectType: "workspace", objectId: ws, summary: `renamed the workspace to “${parsed.data}”` });
    });
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Anyone may create an additional workspace; they become its owner through the RPC. */
export async function createWorkspaceAction(name: string): Promise<Result> {
  const parsed = workspaceName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: { newName: parsed.error.issues[0].message } };
  const ctx = await getCtx();
  let id: string;
  try {
    id = await withUser(ctx.user.id, async (tx) => {
      const [row] = await tx`select public.create_workspace(${parsed.data}) as id`;
      await logActivity(tx, { workspaceId: row.id, actorId: ctx.user.id, verb: "created", objectType: "workspace", objectId: row.id, summary: `created the workspace “${parsed.data}”` });
      return row.id as string;
    });
  } catch (e) {
    return friendly(e, "The workspace could not be created. Nothing was changed.");
  }
  (await cookies()).set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/workspace?created=1");
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
const assignable = z.enum(["owner", "admin", "member", "viewer"]);
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function inviteMemberAction(input: z.input<typeof inviteSchema>): Promise<Result<{ outcome: "added" | "invited" }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  const { email, role } = parsed.data;
  try {
    assertCan(ctx.workspace.role, "team.manage");
    const ws = ctx.workspace.workspaceId;
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const [existing] = await tx`select m.role from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = ${ws} and lower(p.email) = ${email}`;
      if (existing) return "already-member" as const;
      const [pending] = await tx`select id from workspace_invitations where workspace_id = ${ws} and lower(email) = ${email} and accepted_at is null and revoked_at is null`;
      if (pending) return "already-invited" as const;
      const [r] = await tx`select public.invite_member(${ws}, ${email}, ${role}::public.workspace_role) as outcome`;
      await logActivity(tx, {
        workspaceId: ws, actorId: ctx.user.id, verb: r.outcome === "added" ? "added" : "invited", objectType: "member", objectId: null,
        summary: r.outcome === "added" ? `added ${email} as ${role}` : `invited ${email} as ${role}`,
      });
      return r.outcome as "added" | "invited";
    });
    if (outcome === "already-member") return { ok: false, error: `${email} is already a member of this workspace.` };
    if (outcome === "already-invited") return { ok: false, error: `${email} already has a pending invitation.` };
    revalidatePath("/settings/team");
    const mail = emailConfigured();
    if (mail) {
      const msg = invitationEmail({ to: email, workspace: ctx.workspace.name, inviter: ctx.profile.fullName || ctx.profile.email, role, added: outcome === "added" });
      after(() => sendEmail(msg).then(() => undefined));
    }
    return {
      ok: true,
      data: { outcome },
      message: outcome === "added"
        ? `${email} already had a CultureCrash account and now has access as ${role}.${mail ? " We emailed them." : ""}`
        : mail
          ? `Invitation emailed to ${email}. They join as ${role} when they sign up with this address.`
          : `Invitation recorded for ${email}. Email isn’t configured on this server — share the sign-up link with them; they join as ${role} when they sign up with this address.`,
    };
  } catch (e) {
    return friendly(e);
  }
}

export async function changeMemberRoleAction(userId: string, role: Role): Promise<Result> {
  if (!isUuid(userId) || !assignable.safeParse(role).success) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "team.manage");
    const ws = ctx.workspace.workspaceId;
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const [m] = await tx`select m.role, coalesce(p.full_name, p.email) as name from workspace_members m left join profiles p on p.id = m.user_id
        where m.workspace_id = ${ws} and m.user_id = ${userId}`;
      if (!m) return "missing";
      if (m.role === role) return "ok";
      // Application-level mirror of the database owner guard, for a clear message.
      if ((m.role === "owner" || role === "owner") && ctx.workspace.role !== "owner") return "owner-only";
      await tx`update workspace_members set role = ${role}::public.workspace_role where workspace_id = ${ws} and user_id = ${userId}`;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "changed_role", objectType: "member", objectId: userId, summary: `changed ${m.name}’s role from ${m.role} to ${role}` });
      return "ok";
    });
    if (outcome === "missing") return { ok: false, error: "That person is no longer a member of this workspace." };
    if (outcome === "owner-only") return { ok: false, error: "Only a workspace owner can change or remove an owner, or make someone an owner." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeMemberAction(userId: string): Promise<Result> {
  if (!isUuid(userId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  if (userId === ctx.user.id) return { ok: false, error: "You can’t remove yourself here. Ask another admin, or transfer ownership first." };
  try {
    assertCan(ctx.workspace.role, "team.manage");
    const ws = ctx.workspace.workspaceId;
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const [m] = await tx`select m.role, coalesce(p.full_name, p.email) as name from workspace_members m left join profiles p on p.id = m.user_id
        where m.workspace_id = ${ws} and m.user_id = ${userId}`;
      if (!m) return "missing";
      if (m.role === "owner" && ctx.workspace.role !== "owner") return "owner-only";
      const del = await tx`delete from workspace_members where workspace_id = ${ws} and user_id = ${userId} returning user_id`;
      if (!del.length) return "forbidden";
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "removed", objectType: "member", objectId: userId, summary: `removed ${m.name} from the workspace` });
      return "ok";
    });
    if (outcome === "missing") return { ok: false, error: "That person is no longer a member of this workspace." };
    if (outcome === "owner-only") return { ok: false, error: "Only a workspace owner can remove another owner." };
    if (outcome === "forbidden") return { ok: false, error: "Your workspace role does not allow removing members." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function revokeInvitationAction(invitationId: string): Promise<Result> {
  if (!isUuid(invitationId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "team.manage");
    const ws = ctx.workspace.workspaceId;
    const email = await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update workspace_invitations set revoked_at = now()
        where id = ${invitationId} and workspace_id = ${ws} and accepted_at is null and revoked_at is null returning email`;
      if (rows.length) await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "revoked", objectType: "invitation", objectId: invitationId, summary: `revoked the invitation for ${rows[0].email}` });
      return (rows[0]?.email as string | undefined) ?? null;
    });
    if (!email) return { ok: false, error: "That invitation was already accepted or revoked." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/settings/team");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Integrations (non-secret, per-workspace preferences only)
// ---------------------------------------------------------------------------
const integrationSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("qloo"),
    enabled: z.boolean(),
    config: z.object({ defaultLocation: optText(120, "Default location") }),
  }),
  z.object({ provider: z.literal("llm"), enabled: z.boolean(), config: z.object({}).strict() }),
  z.object({ provider: z.literal("web_research"), enabled: z.boolean(), config: z.object({}).strict() }),
]);

export async function updateIntegrationAction(input: z.input<typeof integrationSchema>): Promise<Result> {
  const parsed = integrationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "integrations.manage");
    const d = parsed.data;
    const ws = ctx.workspace.workspaceId;
    const config = Object.fromEntries(Object.entries(d.config).filter(([, v]) => v !== null));
    await withUser(ctx.user.id, async (tx) => {
      await tx`insert into integration_settings (workspace_id, provider, enabled, config, updated_by, updated_at)
        values (${ws}, ${d.provider}, ${d.enabled}, ${tx.json(config)}, ${ctx.user.id}, now())
        on conflict (workspace_id, provider) do update set enabled = excluded.enabled, config = excluded.config, updated_by = excluded.updated_by, updated_at = now()`;
      await logActivity(tx, {
        workspaceId: ws, actorId: ctx.user.id, verb: "configured", objectType: "integration", objectId: null,
        summary: `${d.enabled ? "enabled" : "disabled"} the ${d.provider === "web_research" ? "web research" : d.provider === "llm" ? "LLM" : "Qloo"} integration for this workspace`,
      });
    });
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/settings/integrations");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
const passwordSchema = z
  .object({
    current: z.string().max(200).optional(),
    next: z.string().min(10, "Use at least 10 characters").max(200, "Use at most 200 characters"),
    confirm: z.string(),
    recovery: z.boolean().optional(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "The passwords don’t match" });

export async function changePasswordAction(input: z.input<typeof passwordSchema>): Promise<Result> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  // Current-session check: the verified session must still belong to this user.
  const session = await getSessionUser();
  if (!session || session.id !== ctx.user.id) return { ok: false, error: "Your session has expired. Sign in again, then change your password." };
  const d = parsed.data;
  const mode = env().AUTH_MODE;
  // Recovery links (Supabase) authenticate the session without a current password.
  const skipCurrent = mode === "supabase" && d.recovery === true;
  if (!skipCurrent && !d.current) return { ok: false, error: "Enter your current password.", fieldErrors: { current: "Enter your current password" } };
  if (d.current && d.current === d.next) return { ok: false, error: "Choose a password different from your current one.", fieldErrors: { next: "Must differ from your current password" } };
  try {
    if (!skipCurrent) {
      const check = mode === "local" ? await localSignIn(session.email, d.current!) : await supabaseSignIn(session.email, d.current!);
      if (!check.ok) return { ok: false, error: "Your current password is incorrect.", fieldErrors: { current: "Incorrect password" } };
    }
    const result = mode === "local" ? await localUpdatePassword(session.id, d.next) : await supabaseUpdatePassword(d.next);
    if (!result.ok) return { ok: false, error: result.error };
  } catch (e) {
    return friendly(e, "Your password could not be changed. Nothing was updated.");
  }
  return { ok: true, message: "Password updated. Use it next time you sign in." };
}

export async function deleteAccountAction(confirmEmail: string): Promise<Result> {
  const ctx = await getCtx();
  if (confirmEmail.trim().toLowerCase() !== ctx.user.email.toLowerCase()) {
    return { ok: false, error: "Type your account email exactly to confirm.", fieldErrors: { confirm: "Does not match your email" } };
  }
  if (env().AUTH_MODE !== "local") {
    return { ok: false, error: "Account deletion is handled by a workspace administrator through Supabase Auth in this deployment. Export your data first, then contact your administrator." };
  }
  const { blocking, soloOwned } = await soleOwnerBlockers(ctx);
  if (blocking.length) {
    return { ok: false, error: `You are the only owner of ${blocking.map((b) => `“${b.name}”`).join(", ")}, which still has other members. Make someone else an owner, or remove the other members, first.` };
  }
  try {
    await localDeleteAccount(ctx.user.id);
    if (soloOwned.length) {
      // Workspaces this user was the only member of are now orphaned: remove them too.
      // (The owner guard prevents deleting them through RLS while the owner row exists.)
      // Ids come from the server-side query above; the not-exists check keeps this safe.
      const ids = soloOwned.map((w) => w.id);
      await privilegedSql()`delete from workspaces w where w.id = any(${ids}::uuid[])
        and not exists (select 1 from workspace_members m where m.workspace_id = w.id)`;
    }
  } catch (e) {
    return friendly(e, "Your account could not be deleted. Nothing was removed.");
  }
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/?account=deleted");
}

// ---------------------------------------------------------------------------
// Retention & workspace deletion
// ---------------------------------------------------------------------------
const RETENTION_CHOICES: (number | null)[] = [null, 30, 90, 180, 365];

export async function updateRetentionAction(days: number | null): Promise<Result> {
  if (!RETENTION_CHOICES.includes(days)) return { ok: false, error: "Choose one of the listed retention periods." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "workspace.delete");
    const ws = ctx.workspace.workspaceId;
    await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update workspaces set data_retention_days = ${days} where id = ${ws} returning id`;
      if (!rows.length) throw Object.assign(new Error("forbidden"), { code: "42501" });
      await logActivity(tx, {
        workspaceId: ws, actorId: ctx.user.id, verb: "configured", objectType: "workspace", objectId: ws,
        summary: days ? `set data retention to ${days} days` : "turned off automatic data retention",
      });
    });
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/settings/workspace");
  return { ok: true };
}

/** Owner-only. Removes stored brief files first, then the workspace (everything cascades). */
export async function deleteWorkspaceAction(confirmName: string): Promise<Result> {
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "workspace.delete");
  } catch (e) {
    return friendly(e);
  }
  const ws = ctx.workspace;
  if (confirmName.trim() !== ws.name) return { ok: false, error: "Type the workspace name exactly to confirm.", fieldErrors: { confirm: "Does not match the workspace name" } };
  if (ctx.memberships.length < 2) return { ok: false, error: "This is your only workspace. Create another workspace first, or delete your account instead." };
  const e = env();
  try {
    const paths = await withUser(ctx.user.id, async (tx) =>
      (await tx`select storage_path from brief_documents where workspace_id = ${ws.workspaceId} and storage_path is not null`).map((r) => r.storage_path as string));
    if (paths.length && e.AUTH_MODE === "supabase" && e.NEXT_PUBLIC_SUPABASE_URL) {
      const { supabaseServer } = await import("@/lib/auth/supabase");
      const client = await supabaseServer();
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await client.storage.from(e.SUPABASE_STORAGE_BUCKET).remove(paths.slice(i, i + 100));
        if (error) throw new Error("storage cleanup failed");
      }
    }
    await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`delete from workspaces where id = ${ws.workspaceId} returning id`;
      if (!rows.length) throw Object.assign(new Error("forbidden"), { code: "42501" });
    });
  } catch (err) {
    return friendly(err, "The workspace could not be deleted. Nothing in the database was removed.");
  }
  const next = ctx.memberships.find((m) => m.workspaceId !== ws.workspaceId)!;
  (await cookies()).set(WORKSPACE_COOKIE, next.workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard?workspace=deleted");
}
