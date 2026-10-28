"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "./activity";
import { friendly, invalid, optText, type Result } from "./action-utils";
import { isUuid } from "./projects";
import { getCtx } from "./workspace";

const website = z
  .string()
  .trim()
  .max(300, "Keep the website under 300 characters")
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  })
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter a valid website address, e.g. example.com");

const clientSchema = z.object({
  name: z.string().trim().min(1, "Give the client a name").max(160, "Keep the name under 160 characters"),
  industry: optText(120, "Industry"),
  website,
  notes: optText(4000, "Notes"),
});

export type ClientInput = z.input<typeof clientSchema>;

export async function createClientAction(input: ClientInput): Promise<Result<{ id: string }>> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const d = parsed.data;
    const ws = ctx.workspace.workspaceId;
    const id = await withUser(ctx.user.id, async (tx) => {
      const [c] = await tx`insert into clients (workspace_id, name, industry, website, notes, created_by)
        values (${ws}, ${d.name}, ${d.industry}, ${d.website}, ${d.notes}, ${ctx.user.id}) returning id`;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "created", objectType: "client", objectId: c.id, summary: `added client “${d.name}”` });
      return c.id as string;
    });
    revalidatePath("/workspace", "layout");
    return { ok: true, data: { id } };
  } catch (e) {
    return friendly(e);
  }
}

export async function updateClientAction(clientId: string, input: ClientInput): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Client not found." };
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const d = parsed.data;
    const ws = ctx.workspace.workspaceId;
    const found = await withUser(ctx.user.id, async (tx) => {
      const rows = await tx`update clients set name = ${d.name}, industry = ${d.industry}, website = ${d.website}, notes = ${d.notes}
        where id = ${clientId} and workspace_id = ${ws} returning id`;
      if (rows.length) await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "updated", objectType: "client", objectId: clientId, summary: `updated client details for “${d.name}”` });
      return rows.length > 0;
    });
    if (!found) return { ok: false, error: "Client not found." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(`/workspace/clients/${clientId}`);
  revalidatePath("/workspace/clients");
  return { ok: true };
}

export async function deleteClientAction(clientId: string, confirmName: string): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Client not found." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "data.delete");
    const ws = ctx.workspace.workspaceId;
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const [c] = await tx`select name from clients where id = ${clientId} and workspace_id = ${ws}`;
      if (!c) return "missing" as const;
      if (c.name !== confirmName.trim()) return "mismatch" as const;
      // Projects keep existing (client_id is set null); brand memory is removed with the client.
      const del = await tx`delete from clients where id = ${clientId} and workspace_id = ${ws} returning id`;
      if (!del.length) return "forbidden" as const;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: "deleted", objectType: "client", objectId: null, summary: `deleted client “${c.name}” and its brand memory` });
      return "ok" as const;
    });
    if (outcome === "missing") return { ok: false, error: "Client not found." };
    if (outcome === "mismatch") return { ok: false, error: "The name you typed does not match the client name." };
    if (outcome === "forbidden") return { ok: false, error: "Your workspace role does not allow deleting clients." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath("/workspace", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Brand memory
// ---------------------------------------------------------------------------
const brandSchema = z.object({
  guidelines: optText(12000, "Guidelines"),
  approvedMessaging: optText(8000, "Approved messaging"),
  positioning: optText(6000, "Positioning"),
  audienceDefinitions: optText(8000, "Audience definitions"),
  priorDecisions: optText(8000, "Prior decisions"),
});
export type BrandInput = z.input<typeof brandSchema>;

/**
 * Saves brand memory. Editing approved content returns it to draft: an approval
 * applies to the exact text an admin reviewed.
 */
export async function saveBrandMemoryAction(clientId: string, input: BrandInput): Promise<Result<{ status: "draft" | "approved" }>> {
  if (!isUuid(clientId)) return { ok: false, error: "Client not found." };
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const d = parsed.data;
    const ws = ctx.workspace.workspaceId;
    const result = await withUser(ctx.user.id, async (tx) => {
      const [c] = await tx`select name from clients where id = ${clientId} and workspace_id = ${ws}`;
      if (!c) return null;
      const [prev] = await tx`select guidelines, approved_messaging, positioning, audience_definitions, prior_decisions, approval_status
        from brand_profiles where client_id = ${clientId} for update`;
      const changed = !prev
        || prev.guidelines !== d.guidelines || prev.approved_messaging !== d.approvedMessaging || prev.positioning !== d.positioning
        || prev.audience_definitions !== d.audienceDefinitions || prev.prior_decisions !== d.priorDecisions;
      if (!changed) return { status: prev.approval_status as "draft" | "approved", reverted: false };
      const [row] = await tx`
        insert into brand_profiles (client_id, workspace_id, guidelines, approved_messaging, positioning, audience_definitions, prior_decisions, updated_by)
        values (${clientId}, ${ws}, ${d.guidelines}, ${d.approvedMessaging}, ${d.positioning}, ${d.audienceDefinitions}, ${d.priorDecisions}, ${ctx.user.id})
        on conflict (client_id) do update set guidelines = excluded.guidelines, approved_messaging = excluded.approved_messaging,
          positioning = excluded.positioning, audience_definitions = excluded.audience_definitions, prior_decisions = excluded.prior_decisions,
          updated_by = excluded.updated_by, approval_status = 'draft', approved_by = null, approved_at = null
        returning approval_status`;
      const reverted = prev?.approval_status === "approved";
      await logActivity(tx, {
        workspaceId: ws, actorId: ctx.user.id, verb: "updated", objectType: "brand_profile", objectId: clientId,
        summary: reverted ? `edited approved brand memory for “${c.name}” (returned to draft)` : `updated brand memory for “${c.name}”`,
      });
      return { status: row.approval_status as "draft" | "approved", reverted };
    });
    if (!result) return { ok: false, error: "Client not found." };
    revalidatePath(`/workspace/clients/${clientId}`, "layout");
    return { ok: true, data: { status: result.status }, message: result.reverted ? "Saved. Edits return approved brand memory to draft until an admin approves again." : "Brand memory saved." };
  } catch (e) {
    return friendly(e);
  }
}

export async function setBrandApprovalAction(clientId: string, approve: boolean): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Client not found." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "brand.approve");
    const ws = ctx.workspace.workspaceId;
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const [c] = await tx`select name from clients where id = ${clientId} and workspace_id = ${ws}`;
      if (!c) return "missing";
      const rows = approve
        ? await tx`update brand_profiles set approval_status = 'approved', approved_by = ${ctx.user.id}, approved_at = now()
            where client_id = ${clientId} and workspace_id = ${ws}
              and coalesce(guidelines, approved_messaging, positioning, audience_definitions, prior_decisions) is not null returning client_id`
        : await tx`update brand_profiles set approval_status = 'draft', approved_by = null, approved_at = null
            where client_id = ${clientId} and workspace_id = ${ws} returning client_id`;
      if (!rows.length) return "empty";
      await logActivity(tx, {
        workspaceId: ws, actorId: ctx.user.id, verb: approve ? "approved" : "unapproved", objectType: "brand_profile", objectId: clientId,
        summary: approve ? `approved brand memory for “${c.name}”` : `returned brand memory for “${c.name}” to draft`,
      });
      return "ok";
    });
    if (outcome === "missing") return { ok: false, error: "Client not found." };
    if (outcome === "empty") return { ok: false, error: "Save some brand memory before approving it." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(`/workspace/clients/${clientId}`, "layout");
  return { ok: true };
}
