import "server-only";
import type { Tx } from "@/lib/db";
import type { DeepView, DocumentRow, ClaimRow, QlooObservationRow } from "./view-types";

/** The run's Qloo observations (provider_observation evidence joined to the entity it observes). */
export async function readQlooObservations(tx: Tx, runId: string): Promise<QlooObservationRow[]> {
  const rows = await tx`
    select ev.id as evidence_id, ce.id as entity_id, ce.name, ce.entity_type, ce.role, ce.affinity, ce.popularity, ce.properties->>'cultural_tier' as tier, ev.claim
    from evidence_items ev join cultural_entities ce on ce.id = ev.entity_ids[1]
    where ev.run_id = ${runId} and ev.evidence_type = 'provider_observation'
    order by ce.role = 'seed' desc, ce.affinity desc nulls last limit 120`;
  return rows.map((r) => ({
    evidenceId: r.evidence_id, entityId: r.entity_id, name: r.name, type: r.role === "tag" ? "tag" : r.entity_type, role: r.role,
    affinity: r.affinity === null ? null : Number(r.affinity), popularity: r.popularity === null ? null : Number(r.popularity), tier: r.tier, claim: r.claim,
  }));
}

/** Documents of a run (paginated), newest relevant first. RLS scopes to the caller's workspaces. */
export async function readDocuments(tx: Tx, runId: string, opts: { limit?: number; offset?: number; includeDuplicates?: boolean } = {}): Promise<DocumentRow[]> {
  const rows = await tx`
    select d.*, (select count(*)::int from evidence_items ev where ev.run_id = d.run_id and d.id = any(ev.document_ids)) as claim_count
    from research_documents d where d.run_id = ${runId} ${opts.includeDuplicates ? tx`` : tx`and d.duplicate_of is null`}
    order by d.retrieved_at, d.id limit ${opts.limit ?? 200} offset ${opts.offset ?? 0}`;
  return rows.map((d) => ({
    id: d.id, provider: d.provider, sourceType: d.source_type, url: d.canonical_url, title: d.title, publisher: d.publisher,
    publishedAt: d.published_at ? new Date(d.published_at).toISOString() : null, retrievedAt: new Date(d.retrieved_at).toISOString(),
    excerpt: d.excerpt ? (d.excerpt as string).slice(0, 600) : null, extraction: d.extraction_status, group: d.independence_group,
    duplicateOf: d.duplicate_of, questionKeys: d.question_keys ?? [], metrics: d.metrics ?? {}, restrictions: d.usage_restrictions, isDemo: d.is_demo, claimCount: d.claim_count,
  }));
}

/** Claims of a run with their supporting documents. */
export async function readClaims(tx: Tx, runId: string, opts: { limit?: number; offset?: number; questionKey?: string | null } = {}): Promise<ClaimRow[]> {
  const rows = await tx`
    select ev.id, ev.evidence_type, ev.claim_type, ev.claim, ev.excerpt, ev.question_key, ev.extraction_method, ev.quality, ev.independent_sources,
      ev.contradicts, ev.document_ids, ev.review_status, ev.limitations, ev.source_url, ev.source_provider, ev.raw_metadata, ev.is_demo, ev.entity_ids
    from evidence_items ev
    where ev.run_id = ${runId} and ev.claim_type is not null ${opts.questionKey ? tx`and ev.question_key = ${opts.questionKey}` : tx``}
    order by case ev.claim_type when 'strategic_hypothesis' then 2 when 'model_interpretation' then 1 else 0 end, (ev.quality->>'score')::numeric desc nulls last, ev.created_at
    limit ${opts.limit ?? 300} offset ${opts.offset ?? 0}`;
  return rows.map((c) => ({
    id: c.id, evidenceType: c.evidence_type, claimType: c.claim_type, text: c.claim, excerpt: c.excerpt, questionKey: c.question_key, method: c.extraction_method,
    quality: c.quality && Object.keys(c.quality).length ? c.quality : null, independent: c.independent_sources, contradicts: c.contradicts ?? [], documentIds: c.document_ids ?? [],
    review: c.review_status, limitations: c.limitations, url: c.source_url, provider: c.source_provider,
    supporting: (c.raw_metadata?.supporting_evidence_ids as string[] | undefined) ?? [], isDemo: c.is_demo, entityIds: c.entity_ids ?? [],
  }));
}

export async function readDeepView(tx: Tx, run: Record<string, unknown>): Promise<DeepView | null> {
  if (!run.depth) return null;
  const runId = run.id as string;
  const [documents, claims, dupes, qloo] = await Promise.all([
    readDocuments(tx, runId),
    readClaims(tx, runId),
    tx`select count(*)::int as n from research_documents where run_id = ${runId} and duplicate_of is not null`,
    readQlooObservations(tx, runId),
  ]);
  const plan = (run.plan as { deep?: DeepView["plan"] })?.deep ?? null;
  return {
    depth: run.depth as DeepView["depth"], stage: (run.stage as string) ?? null, question: (run.research_question as string) ?? null, plan,
    report: (run.report as DeepView["report"]) ?? null, coverage: (run.coverage as DeepView["coverage"]) ?? [], usage: (run.usage as DeepView["usage"]) ?? null,
    stopReason: (run.stop_reason as string) ?? null, cancelRequested: Boolean(run.cancel_requested_at), documents, claims, duplicatesRemoved: dupes[0].n, qloo,
  };
}
