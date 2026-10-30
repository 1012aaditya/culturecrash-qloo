import "server-only";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/data/workspace";
import { storageAvailable } from "@/lib/boards/data";
import type { Provenance } from "./context";

/** An image on its way to the board, with where its card goes (a group, or beside the card it improves on). */
export type PendingConcept = { id: string; kind: "concept" | "variation"; title?: string; group?: string; anchor?: string; improvedFrom?: string; touch?: string; copy?: { headline: string; line: string } };

/** Generation needs a GPU PC token and Storage for the results. */
export function conceptsEnabled() {
  return Boolean(env().CC_WORKER_TOKEN) && storageAvailable();
}

/** This user's images still on their way to the board, so a reload picks them up again. */
export async function pendingConcepts(ctx: Ctx, boardId: string): Promise<PendingConcept[]> {
  if (!conceptsEnabled()) return [];
  const rows = await withUser(ctx.user.id, (tx) => tx`select id, workflow, provenance from concept_jobs
    where board_id = ${boardId} and created_by = ${ctx.user.id} and created_at > now() - interval '2 hours'
      and (status in ('queued', 'running') or (status = 'done' and result_path is null))
    order by created_at limit 20`);
  return rows.map((r) => pendingFrom(r.id as string, r.workflow as string, r.provenance as Provenance | null));
}

export function pendingFrom(id: string, workflow: string, p: Provenance | null): PendingConcept {
  return {
    id, kind: workflow === "w3-variation" ? "variation" : "concept",
    ...(p?.title ? { title: p.title } : {}), ...(p?.placement?.group ? { group: p.placement.group } : {}),
    ...(p?.placement?.anchor ? { anchor: p.placement.anchor } : {}), ...(p?.improvement ? { improvedFrom: p.improvement.fromLevel } : {}),
    ...(p?.placement?.touch ? { touch: p.placement.touch } : {}), ...(p?.placement?.copy ? { copy: p.placement.copy } : {}),
  };
}

/** The brand name for touchpoint mockups (from the campaign brief). */
export async function briefBrand(ctx: Ctx, projectId: string): Promise<string> {
  const [b] = await withUser(ctx.user.id, (tx) => tx`select brand from campaign_briefs where project_id = ${projectId}`);
  return typeof b?.brand === "string" ? b.brand.slice(0, 60) : "";
}
