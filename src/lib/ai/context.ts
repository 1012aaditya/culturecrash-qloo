import "server-only";
import type { Tx } from "@/lib/db";
import type { Observation } from "./template";

/** Approved read tools: each runs under the user's RLS identity for one project. */
export async function readObservations(tx: Tx, projectId: string, opts: { runId?: string | null; limit?: number; keyword?: string } = {}): Promise<Observation[]> {
  const runId = opts.runId ?? (await tx`select id from research_runs where project_id = ${projectId} and status = 'completed' order by created_at desc limit 1`)[0]?.id;
  if (!runId) return [];
  const kw = opts.keyword?.trim() ? `%${opts.keyword.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await tx`
    select ev.id, ev.claim, ev.normalized_value, ce.name, ce.entity_type, ce.role
    from evidence_items ev left join cultural_entities ce on ce.id = ev.entity_ids[1]
    where ev.project_id = ${projectId} and ev.run_id = ${runId} and ev.evidence_type = 'provider_observation'
      ${kw ? tx`and (ev.claim ilike ${kw} or ce.name ilike ${kw})` : tx``}
    order by ev.normalized_value desc nulls last limit ${opts.limit ?? 80}`;
  return rows.map((r) => ({ id: r.id, claim: r.claim, entityName: r.name, entityType: r.entity_type, affinity: r.normalized_value === null ? null : Number(r.normalized_value), role: r.role }));
}

export async function latestCompletedRun(tx: Tx, projectId: string) {
  const [r] = await tx`select id, mode from research_runs where project_id = ${projectId} and status = 'completed' order by created_at desc limit 1`;
  return (r as { id: string; mode: "live" | "demo" } | undefined) ?? null;
}
