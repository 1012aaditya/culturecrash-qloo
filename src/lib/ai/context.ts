import "server-only";
import type { Tx } from "@/lib/db";
import { hostOf } from "@/lib/research/deep/url";
import type { Observation } from "./template";

/** Approved read tools: each runs under the user's RLS identity for one project. */
export async function readObservations(tx: Tx, projectId: string, opts: { runId?: string | null; limit?: number; keyword?: string } = {}): Promise<Observation[]> {
  const runId = opts.runId ?? (await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`)[0]?.id;
  if (!runId) return [];
  const kw = opts.keyword?.trim() ? `%${opts.keyword.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  // The strongest items of each kind (Qloo observations, external claims), up to the limit per kind.
  const rows = await tx`
    select * from (
      select ev.id, ev.claim, ev.normalized_value, ev.claim_type, ev.evidence_type, ev.source_provider, ev.source_url, ce.name, ce.entity_type, ce.role,
        row_number() over (partition by ev.evidence_type order by coalesce(ev.normalized_value, (ev.quality->>'score')::numeric) desc nulls last) as rank_in_kind
      from evidence_items ev left join cultural_entities ce on ce.id = ev.entity_ids[1]
      where ev.project_id = ${projectId} and ev.run_id = ${runId} and ev.review_status <> 'rejected'
        and (ev.evidence_type = 'provider_observation'
          or (ev.evidence_type = 'external_source' and ev.claim_type in ('source_fact', 'source_opinion', 'observed_measurement')))
        ${kw ? tx`and (ev.claim ilike ${kw} or ce.name ilike ${kw})` : tx``}
    ) ranked where rank_in_kind <= ${opts.limit ?? 80}
    order by rank_in_kind`;
  // Web/community claims carry role "web" and no affinity: they are cited source claims, not Qloo measurements.
  // Only provider observations carry a Qloo role/affinity; web claims linked to a Qloo entity stay "web".
  // Qloo observations and web/community claims get half the slots each (unused slots go to the other),
  // so a long Qloo list can't crowd out every external source. Rejected evidence is never offered.
  const limit = opts.limit ?? 80;
  const qloo = rows.filter((r) => r.evidence_type === "provider_observation");
  const web = rows.filter((r) => r.evidence_type !== "provider_observation");
  const half = Math.ceil(limit / 2);
  const takeWeb = Math.min(web.length, Math.max(half, limit - qloo.length));
  const picked = [...qloo.slice(0, limit - takeWeb), ...web.slice(0, takeWeb)];
  return picked.map((r) => {
    const source = (r.source_url ? hostOf(r.source_url as string) : null) ?? (r.source_provider as string | null);
    return r.evidence_type === "provider_observation"
      ? { id: r.id, claim: r.claim, entityName: r.name, entityType: r.entity_type, affinity: r.normalized_value === null ? null : Number(r.normalized_value), role: r.role, source }
      : { id: r.id, claim: r.claim, entityName: r.name ?? null, entityType: r.claim_type, affinity: null, role: "web", source };
  });
}

export async function latestCompletedRun(tx: Tx, projectId: string) {
  const [r] = await tx`select id, mode from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
  return (r as { id: string; mode: "live" | "demo" } | undefined) ?? null;
}
