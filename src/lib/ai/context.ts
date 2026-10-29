import "server-only";
import type { Tx } from "@/lib/db";
import type { Observation } from "./template";

/** Approved read tools: each runs under the user's RLS identity for one project. */
export async function readObservations(tx: Tx, projectId: string, opts: { runId?: string | null; limit?: number; keyword?: string } = {}): Promise<Observation[]> {
  const runId = opts.runId ?? (await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`)[0]?.id;
  if (!runId) return [];
  const kw = opts.keyword?.trim() ? `%${opts.keyword.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await tx`
    select ev.id, ev.claim, ev.normalized_value, ev.claim_type, ce.name, ce.entity_type, ce.role
    from evidence_items ev left join cultural_entities ce on ce.id = ev.entity_ids[1]
    where ev.project_id = ${projectId} and ev.run_id = ${runId}
      and (ev.evidence_type = 'provider_observation'
        or (ev.evidence_type = 'external_source' and ev.claim_type in ('source_fact', 'source_opinion', 'observed_measurement')))
      ${kw ? tx`and (ev.claim ilike ${kw} or ce.name ilike ${kw})` : tx``}
    order by ev.evidence_type = 'provider_observation' desc, coalesce(ev.normalized_value, (ev.quality->>'score')::numeric) desc nulls last
    limit ${opts.limit ?? 80}`;
  // Web/community claims carry role "web" and no affinity: they are cited source claims, not Qloo measurements.
  return rows.map((r) => ({ id: r.id, claim: r.claim, entityName: r.name, entityType: r.entity_type ?? r.claim_type, affinity: r.normalized_value === null ? null : Number(r.normalized_value), role: r.role ?? "web" }));
}

export async function latestCompletedRun(tx: Tx, projectId: string) {
  const [r] = await tx`select id, mode from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
  return (r as { id: string; mode: "live" | "demo" } | undefined) ?? null;
}
