import "server-only";
import { generatorLabel } from "@/lib/ai";
import type { CreativeBriefContent, DirectionContent, ResearchInterpretation } from "@/lib/ai/schemas";
import type { Tx } from "@/lib/db";
import { loadBrief } from "@/lib/data/briefs";
import { AFFINITY_LIMITATION, type ResearchPlan } from "@/lib/research/engine";
import { REPORT_SECTIONS, type ReportSectionKey, type ReportSnapshot } from "./types";

/**
 * Builds an immutable snapshot of the project's current state. Reports render only
 * from snapshots, so later research or strategy changes never rewrite a report.
 * No new content is generated here: every sentence comes from stored records.
 */
export async function buildSnapshot(tx: Tx, projectId: string, sections: ReportSectionKey[], title: string): Promise<ReportSnapshot> {
  const brief = (await loadBrief(tx, projectId))!;
  const [run] = await tx`select * from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
  const entities = run ? await tx`select name, entity_type, role, affinity, popularity from cultural_entities where run_id = ${run.id} and role <> 'seed' order by affinity desc nulls last` : [];
  const sources = run ? await tx`select endpoint, params, status, http_status, result_count, retrieved_at from research_sources where run_id = ${run.id} order by retrieved_at` : [];
  // The signals actually sent to Qloo: brief names that Qloo did not match are not signals.
  const seeds = run ? await tx`select name, properties->>'query' as query, properties->>'kind' as kind from cultural_entities where run_id = ${run.id} and role = 'seed' order by retrieved_at, name` : [];
  const [{ docs: externalDocs }] = run ? await tx`select count(*)::int as docs from research_documents where run_id = ${run.id}` : [{ docs: 0 }];
  const evidence = await tx`select id, evidence_type, claim, source_provider, source_ref, source_url, retrieved_at, normalized_value, review_status, is_demo from evidence_items
    where project_id = ${projectId} and (run_id = ${run?.id ?? null} or run_id is null) order by (evidence_type = 'approved_conclusion') desc, normalized_value desc nulls last limit 60`;
  const opps = await tx`select title, description, why_it_matters, unknowns, validation_step, status, generator, evidence_ids from opportunities where project_id = ${projectId} and status <> 'dismissed' order by (status = 'saved') desc limit 8`;
  const [version] = await tx`select id, version, generator, is_demo from strategy_versions where project_id = ${projectId} order by version desc limit 1`;
  const dirs = version ? await tx`select distinct on (slot) id, name, content, status, is_exploratory, revision from strategy_directions where version_id = ${version.id} order by slot, (status = 'selected') desc, revision desc` : [];
  const [p] = await tx`select selected_direction_id from projects where id = ${projectId}`;
  const [selected] = p?.selected_direction_id ? await tx`select id, name, content, revision from strategy_directions where id = ${p.selected_direction_id}` : [];
  const [cb] = await tx`select content, generator, revision from creative_briefs where project_id = ${projectId} order by created_at desc limit 1`;
  const experiments = await tx`select x.id, x.name, x.hypothesis, x.method, x.primary_metric, x.decision_threshold, x.status, x.interpretation, x.next_action,
    coalesce((select json_agg(json_build_object('variant', v.label, 'metric', r.metric, 'value', r.value, 'n', r.sample_size) order by r.created_at)
      from experiment_results r left join experiment_variants v on v.id = r.variant_id where r.experiment_id = x.id), '[]') as results
    from experiments x where x.project_id = ${projectId} and x.status <> 'cancelled' order by x.created_at`;

  const interp = (run?.interpretation ?? null) as ResearchInterpretation | null;
  const plan = (run?.plan ?? null) as ResearchPlan | null;
  const isDemo = Boolean(run?.mode === "demo" || version?.is_demo || brief.isDemo);
  const sel = selected ? { name: selected.name as string, content: selected.content as DirectionContent, revision: selected.revision as number } : null;
  const byType = new Map<string, { name: string; affinity: number | null }[]>();
  for (const e of entities) {
    const k = e.role === "tag" ? "taste tags" : (e.entity_type as string).replace("_", " ");
    byType.set(k, [...(byType.get(k) ?? []), { name: e.name, affinity: e.affinity === null ? null : Number(e.affinity) }]);
  }

  const limitations = [
    AFFINITY_LIMITATION,
    ...(interp?.missingInformation ?? []),
    ...(run?.error_code === "partial" ? [String(run.error_message)] : []),
    ...(!run ? ["No completed research run: this report contains no provider data."] : []),
    ...(dirs.some((d) => d.is_exploratory) ? ["One or more positioning directions are marked exploratory because evidence is limited."] : []),
    ...(isDemo ? ["This report includes DEMONSTRATION DATA built from fixture records. It must not be presented as research."] : []),
    ...(run && externalDocs === 0 ? ["No external sources (web, video, community or client documents) were retrieved in this research run; external evidence is limited to sources entered manually."] : []),
  ];

  return {
    title,
    projectName: brief.name,
    clientName: brief.clientName,
    generatedAt: new Date().toISOString(),
    containsDemoData: isDemo,
    sections,
    available: REPORT_SECTIONS.map(([k]) => k),
    executiveSummary: {
      research: interp?.summary ?? null,
      selectedDirection: sel ? `${sel.name}: ${sel.content.coreIdea}` : null,
      opportunities: opps.slice(0, 3).map((o) => o.title as string),
      experiments: experiments.map((x) => `${x.name} (${x.status})`),
    },
    brief: {
      brand: brief.brand, product: brief.product, category: brief.category, market: brief.market, audience: brief.audience, objective: brief.objective,
      existingPositioning: brief.existingPositioning, competitors: brief.competitors, timeframe: brief.timeframe, budgetRange: brief.budgetRange, revision: brief.revision,
    },
    methodology: run ? {
      question: run.question as string, mode: run.mode as "live" | "demo", provider: run.provider as string, runAt: new Date(run.created_at).toISOString(), briefRevision: run.brief_revision as number | null,
      signals: seeds.map((s) => (s.query && s.query !== s.name ? `${s.name} (${s.kind ?? "brief"} “${s.query}”)` : (s.name as string))), location: plan?.location ?? null, requests: sources.length, failedRequests: sources.filter((s) => s.status === "error").length,
      interpretationBy: generatorLabel(run.interpretation_generator), notes: plan?.notes ?? [],
    } : null,
    landscape: [...byType.entries()].map(([type, items]) => ({ type, items: items.slice(0, 8) })),
    findings: interp?.findings.map((f) => ({ statement: f.statement, kind: f.kind })) ?? [],
    evidence: evidence.map((e) => ({ id: e.id, type: e.evidence_type, claim: e.claim, source: e.source_provider, ref: e.source_ref, url: e.source_url, retrievedAt: e.retrieved_at ? new Date(e.retrieved_at).toISOString() : null, value: e.normalized_value === null ? null : Number(e.normalized_value), review: e.review_status })),
    opportunities: opps.map((o) => ({ title: o.title, description: o.description, whyItMatters: o.why_it_matters, unknowns: o.unknowns, validation: o.validation_step, status: o.status, generatedBy: generatorLabel(o.generator), evidenceIds: o.evidence_ids })),
    directions: dirs.map((d) => ({ name: d.name, selected: d.status === "selected", exploratory: d.is_exploratory, revision: d.revision, content: d.content as DirectionContent })),
    strategyGeneratedBy: version ? generatorLabel(version.generator) : null,
    selected: sel,
    creativeBrief: cb ? { content: cb.content as CreativeBriefContent, generatedBy: generatorLabel(cb.generator), revision: cb.revision } : null,
    experiments: experiments.map((x) => ({ name: x.name, hypothesis: x.hypothesis, method: x.method, primaryMetric: x.primary_metric, threshold: x.decision_threshold, status: x.status, interpretation: x.interpretation, nextAction: x.next_action, results: x.results })),
    limitations,
    openQuestions: interp?.followUpQuestions ?? [],
    sources: sources.map((s) => ({ endpoint: s.endpoint, params: s.params, status: s.status, httpStatus: s.http_status, results: s.result_count, retrievedAt: new Date(s.retrieved_at).toISOString() })),
    refs: { runId: run?.id ?? null, strategyVersionId: version?.id ?? null },
  };
}
