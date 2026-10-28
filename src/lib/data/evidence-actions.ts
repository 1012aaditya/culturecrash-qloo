"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity } from "./activity";
import { isUuid } from "./projects";
import { getCtx } from "./workspace";
import { assertCan, can } from "@/lib/permissions";

const reviewInput = z.object({ projectId: z.string().refine(isUuid), evidenceId: z.string().refine(isUuid), status: z.enum(["unreviewed", "approved", "rejected", "needs_validation"]) });

export async function reviewEvidenceAction(raw: z.input<typeof reviewInput>) {
  const p = reviewInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "strategy.edit");
  await withUser(ctx.user.id, async (tx) => {
    const [ev] = await tx`update evidence_items set review_status = ${p.data.status} where id = ${p.data.evidenceId} and project_id = ${p.data.projectId} returning evidence_type, claim`;
    if (!ev) return;
    // Approving an AI interpretation records a human-approved conclusion alongside it.
    if (p.data.status === "approved" && ev.evidence_type === "ai_interpretation" && can(ctx.workspace.role, "strategy.edit")) {
      await tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim, source_provider, raw_metadata, review_status, created_by)
        values (${p.data.projectId}, ${ctx.workspace.workspaceId}, 'approved_conclusion', ${ev.claim}, 'human review', ${tx.json({ approved_from: p.data.evidenceId })}, 'approved', ${ctx.user.id})`;
    }
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId: p.data.projectId, verb: "reviewed", objectType: "evidence", objectId: p.data.evidenceId, summary: `marked evidence as ${p.data.status.replace("_", " ")}` });
  });
  revalidatePath(`/projects/${p.data.projectId}/evidence/${p.data.evidenceId}`);
  return { ok: true };
}

const commentInput = z.object({ projectId: z.string().refine(isUuid), targetType: z.enum(["evidence", "direction", "opportunity", "experiment"]), targetId: z.string().refine(isUuid), body: z.string().trim().min(1).max(4000), path: z.string().startsWith("/") });

export async function addCommentAction(raw: z.input<typeof commentInput>) {
  const p = commentInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Write a comment up to 4000 characters." };
  const ctx = await getCtx();
  if (!can(ctx.workspace.role, "comment.create")) return { ok: false, error: "Viewers cannot comment." };
  await withUser(ctx.user.id, (tx) => tx`insert into comments (workspace_id, project_id, target_type, target_id, body, author_id)
    values (${ctx.workspace.workspaceId}, ${p.data.projectId}, ${p.data.targetType}, ${p.data.targetId}, ${p.data.body}, ${ctx.user.id})`);
  revalidatePath(p.data.path);
  return { ok: true };
}
