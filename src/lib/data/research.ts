import "server-only";
import { withUser } from "@/lib/db";
import type { ResearchInterpretation } from "@/lib/ai/schemas";
import type { ResearchPlan } from "@/lib/research/engine";
import { readDeepView } from "@/lib/research/deep/read";
import type { DeepView } from "@/lib/research/deep/view-types";
import { isUuid } from "./projects";
import type { Ctx } from "./workspace";

export type RunRow = {
  id: string; status: "queued" | "running" | "completed" | "partially_completed" | "failed" | "cancelled"; depth: "quick" | "standard" | "deep" | null; mode: "live" | "demo"; provider: string; question: string;
  plan: ResearchPlan; errorCode: string | null; errorMessage: string | null; interpretation: ResearchInterpretation | null;
  interpretationGenerator: string | null; startedBy: string | null; createdAt: string; completedAt: string | null; briefRevision: number | null;
  callCount: number; failedCalls: number; entityCount: number;
};

export type EntityRow = {
  id: string; providerId: string; name: string; type: string; role: "seed" | "result" | "tag" | "audience"; affinity: number | null;
  popularity: number | null; tags: string[]; description: string | null; retrievedAt: string; sourceId: string | null; evidenceId: string | null;
  imageUrl: string | null; profileOf: string | null;
  culturalTier?: "white_space" | "consensus" | "competitor_stronghold" | "subcultural_orbit" | null;
  deltaScore?: number | null;
  hop?: number | null;
  subculturalAnchor?: string | null;
};
export type RelRow = { id: string; from: string; to: string; relation: string; value: number | null };
export type SourceRow = { id: string; endpoint: string; params: Record<string, string>; status: string; httpStatus: number | null; resultCount: number; durationMs: number | null; errorMessage: string | null; retrievedAt: string };

const mapRun = (r: Record<string, unknown>): RunRow => ({
  id: r.id as string, status: r.status as RunRow["status"], depth: (r.depth as RunRow["depth"]) ?? null, mode: r.mode as RunRow["mode"], provider: r.provider as string, question: r.question as string,
  plan: r.plan as ResearchPlan, errorCode: r.error_code as string | null, errorMessage: r.error_message as string | null,
  interpretation: r.interpretation as ResearchInterpretation | null, interpretationGenerator: r.interpretation_generator as string | null,
  startedBy: r.started_by_name as string | null, createdAt: new Date(r.created_at as string).toISOString(),
  completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null, briefRevision: r.brief_revision as number | null,
  callCount: Number(r.call_count ?? 0), failedCalls: Number(r.failed_calls ?? 0), entityCount: Number(r.entity_count ?? 0),
});

export async function listRuns(ctx: Ctx, projectId: string) {
  if (!isUuid(projectId)) return [];
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`select r.*, coalesce(p.full_name, p.email) as started_by_name,
      (select count(*) from research_sources s where s.run_id = r.id)::int as call_count,
      (select count(*) from research_sources s where s.run_id = r.id and s.status = 'error')::int as failed_calls,
      (select count(*) from cultural_entities e where e.run_id = r.id and e.role <> 'seed')::int as entity_count
      from research_runs r left join profiles p on p.id = r.started_by where r.project_id = ${projectId} order by r.created_at desc limit 100`;
    return rows.map(mapRun);
  });
}

export async function getResearchView(ctx: Ctx, projectId: string, runId?: string | null) {
  const runs = await listRuns(ctx, projectId);
  const run = (runId && runs.find((r) => r.id === runId)) || runs.find((r) => r.status === "completed" || r.status === "partially_completed") || runs[0] || null;
  if (!run) return { runs, run: null, entities: [] as EntityRow[], relationships: [] as RelRow[], sources: [] as SourceRow[], deep: null as DeepView | null };
  return withUser(ctx.user.id, async (tx) => {
    const entities = await tx`select e.*, (select ev.id from evidence_items ev where ev.run_id = e.run_id and e.id = any(ev.entity_ids) and ev.evidence_type = 'provider_observation' limit 1) as evidence_id
      from cultural_entities e where e.run_id = ${run.id} order by e.role, e.affinity desc nulls last`;
    const rels = await tx`select id, from_entity_id, to_entity_id, relation, value from entity_relationships where run_id = ${run.id}`;
    const sources = await tx`select id, endpoint, params, status, http_status, result_count, duration_ms, error_message, retrieved_at, provider from research_sources where run_id = ${run.id} order by retrieved_at`;
    const [raw] = await tx`select * from research_runs where id = ${run.id}`;
    const deep = await readDeepView(tx, raw);
    return {
      runs,
      run,
      deep,
      entities: entities.map((e): EntityRow => ({
        id: e.id, providerId: e.provider_entity_id, name: e.name, type: e.entity_type, role: e.role, affinity: e.affinity === null ? null : Number(e.affinity),
        popularity: e.popularity === null ? null : Number(e.popularity), tags: e.tags ?? [], description: e.properties?.description ?? null,
        retrievedAt: new Date(e.retrieved_at).toISOString(), sourceId: e.source_id, evidenceId: e.evidence_id,
        imageUrl: e.properties?.image_url ?? null, profileOf: e.properties?.profile_of ?? null,
        culturalTier: (e.properties?.cultural_tier as "white_space" | "consensus" | "competitor_stronghold" | "subcultural_orbit") ?? null,
        deltaScore: typeof e.properties?.delta_score === "number" ? e.properties.delta_score : null,
        hop: typeof e.properties?.hop === "number" ? e.properties.hop : 1,
        subculturalAnchor: typeof e.properties?.subcultural_anchor === "string" ? e.properties.subcultural_anchor : null,
      })),
      relationships: rels.map((r): RelRow => ({ id: r.id, from: r.from_entity_id, to: r.to_entity_id, relation: r.relation, value: r.value === null ? null : Number(r.value) })),
      sources: sources.map((s): SourceRow => ({ id: s.id, endpoint: s.provider === "qloo" || s.provider === "qloo-demo-fixture" ? s.endpoint : `${s.provider} · ${s.endpoint}`, params: s.params, status: s.status, httpStatus: s.http_status, resultCount: s.result_count, durationMs: s.duration_ms, errorMessage: s.error_message, retrievedAt: new Date(s.retrieved_at).toISOString() })),
    };
  });
}
