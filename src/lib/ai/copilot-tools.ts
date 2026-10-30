import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tx } from "@/lib/db";

/**
 * Read-only tools the copilot can call. Every query runs inside the caller's RLS
 * transaction and is additionally scoped to one project, so the model can only
 * see what the signed-in user could open in the app. Nothing here writes.
 */
const limitArg = z.number().int().min(1).max(25).optional();
const schemas = {
  search_evidence: z.object({ query: z.string().trim().min(1).max(80), types: z.array(z.enum(["provider_observation", "ai_interpretation", "external_source", "hypothesis", "experiment_result", "approved_conclusion"])).max(5).optional(), limit: limitArg }),
  get_entity: z.object({ name: z.string().trim().min(1).max(120) }),
  list_opportunities: z.object({ include_dismissed: z.boolean().optional() }),
  get_strategy: z.object({}),
  list_experiments: z.object({}),
  list_research_runs: z.object({}),
  list_boards: z.object({}),
};
export type CopilotToolName = keyof typeof schemas;

export const COPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_evidence",
    description: "Search this campaign's evidence (claims and entity names) by keyword. Returns evidence ids, type, claim, entity, affinity and review status. Use it to find support for, or against, a statement before making it.",
    input_schema: { type: "object", properties: {
      query: { type: "string", description: "A word or short phrase, e.g. an entity name, a theme or a tag." },
      types: { type: "array", items: { type: "string", enum: ["provider_observation", "ai_interpretation", "external_source", "hypothesis", "experiment_result", "approved_conclusion"] }, description: "Optional evidence types to restrict to." },
      limit: { type: "integer", description: "1–25, default 12." },
    }, required: ["query"], additionalProperties: false },
  },
  {
    name: "get_entity",
    description: "Look up a cultural entity or taste tag from the latest completed research run by name: type, role, affinity, popularity, tags, description, the evidence id that records it and its explainability links to signal entities.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
  },
  {
    name: "list_opportunities",
    description: "List the campaign's opportunities with status, why they matter, unknowns and validation step.",
    input_schema: { type: "object", properties: { include_dismissed: { type: "boolean" } }, additionalProperties: false },
  },
  {
    name: "get_strategy",
    description: "Get the current strategy version's positioning directions (latest revision of each) with core idea, positioning, consumer tension, uncertainties, assumptions to test and the evidence ids they cite (search_evidence returns their text; only cite ids whose text you have read).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_experiments",
    description: "List the campaign's experiments with hypothesis, primary metric, decision threshold, status and recorded results.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_research_runs",
    description: "List research runs for this campaign (newest first) with mode (live or demo), status, entity counts and any error.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_boards",
    description: "List the campaign's inspiration boards (visual moodboards) with their colour palette and cards: image captions and sources, notes, links, groups, and the Qloo entities placed on them. Boards are the team's visual references, not research evidence.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const clip = (s: unknown, n = 400) => (typeof s === "string" ? (s.length > n ? `${s.slice(0, n)}…` : s) : s);
/** Only these may be cited as evidence; hypotheses and AI interpretations are readable context, not support. */
const CITABLE = new Set(["provider_observation", "external_source", "experiment_result", "approved_conclusion"]);

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Runs one tool. Returns JSON-serialisable data plus the evidence ids it exposed (for citation checks). */
export async function runCopilotTool(tx: Tx, projectId: string, name: string, rawInput: unknown): Promise<{ result: unknown; evidenceIds: string[] }> {
  if (!(name in schemas)) return { result: { error: `Unknown tool ${name}` }, evidenceIds: [] };
  const parsed = schemas[name as CopilotToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { result: { error: "Invalid input", issues: parsed.error.issues.map((i) => i.message) }, evidenceIds: [] };
  const input = parsed.data as Record<string, unknown>;

  switch (name as CopilotToolName) {
    case "search_evidence": {
      const types = (input.types as string[] | undefined) ?? null;
      const rows = await tx`
        select ev.id, ev.evidence_type, ev.claim, ev.normalized_value, ev.review_status, ev.is_demo, ce.name as entity, ce.entity_type
        from evidence_items ev left join cultural_entities ce on ce.id = ev.entity_ids[1]
        where ev.project_id = ${projectId} and (ev.claim ilike ${like(input.query as string)} or ce.name ilike ${like(input.query as string)})
          ${types ? tx`and ev.evidence_type::text = any(${types})` : tx``}
        order by ev.normalized_value desc nulls last, ev.created_at desc limit ${(input.limit as number | undefined) ?? 12}`;
      return {
        result: rows.map((r) => ({ id: r.id, type: r.evidence_type, claim: clip(r.claim), entity: r.entity, entityType: r.entity_type, affinity: r.normalized_value === null ? null : Number(r.normalized_value), review: r.review_status, demo: r.is_demo })),
        evidenceIds: rows.filter((r) => CITABLE.has(r.evidence_type as string) && r.review_status !== "rejected").map((r) => r.id as string),
      };
    }
    case "get_entity": {
      const [run] = await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
      if (!run) return { result: { error: "No completed research run yet." }, evidenceIds: [] };
      const rows = await tx`
        select e.id, e.name, e.entity_type, e.role, e.affinity, e.popularity, e.tags, e.properties->>'description' as description,
          (select ev.id from evidence_items ev where ev.run_id = e.run_id and e.id = any(ev.entity_ids) and ev.evidence_type = 'provider_observation' limit 1) as evidence_id,
          (select coalesce(json_agg(json_build_object('signal', s.name, 'score', r.value)), '[]') from entity_relationships r join cultural_entities s on s.id = r.from_entity_id where r.to_entity_id = e.id) as explainability
        from cultural_entities e where e.run_id = ${run.id} and e.name ilike ${like(input.name as string)}
        order by e.affinity desc nulls last limit 5`;
      if (!rows.length) return { result: { error: `No entity matching “${input.name}” in the latest run.` }, evidenceIds: [] };
      return {
        result: rows.map((r) => ({ name: r.name, type: r.entity_type, role: r.role, affinity: r.affinity === null ? null : Number(r.affinity), popularity: r.popularity === null ? null : Number(r.popularity), tags: r.tags, description: clip(r.description, 300), evidenceId: r.evidence_id, explainability: r.explainability })),
        evidenceIds: rows.map((r) => r.evidence_id as string).filter(Boolean),
      };
    }
    case "list_opportunities": {
      const rows = await tx`select title, status, why_it_matters, unknowns, validation_step, evidence_ids from opportunities
        where project_id = ${projectId} ${input.include_dismissed ? tx`` : tx`and status <> 'dismissed'`} order by updated_at desc limit 15`;
      return {
        result: rows.map((r) => ({ title: r.title, status: r.status, whyItMatters: clip(r.why_it_matters), unknowns: clip(r.unknowns), validationStep: clip(r.validation_step), evidenceIds: r.evidence_ids })),
        // Ids listed here come without their text, so they aren't citable until search_evidence returns them.
        evidenceIds: [],
      };
    }
    case "get_strategy": {
      const rows = await tx`select distinct on (d.slot) d.name, d.status, d.is_exploratory, d.content, d.evidence_ids
        from strategy_directions d where d.project_id = ${projectId}
          and d.version_id = (select id from strategy_versions where project_id = ${projectId} order by version desc limit 1)
        order by d.slot, d.revision desc`;
      if (!rows.length) return { result: { error: "No strategy directions yet." }, evidenceIds: [] };
      return {
        result: rows.map((r) => ({ name: r.name, status: r.status, exploratory: r.is_exploratory, coreIdea: clip(r.content?.coreIdea), positioning: clip(r.content?.positioningStatement), consumerTension: clip(r.content?.consumerTension), uncertainties: clip(r.content?.uncertainties), assumptionsToTest: r.content?.assumptionsToTest ?? [], evidenceIds: r.evidence_ids })),
        evidenceIds: [],
      };
    }
    case "list_experiments": {
      const rows = await tx`select e.name, e.hypothesis, e.primary_metric, e.decision_threshold, e.status, e.interpretation,
          (select coalesce(json_agg(json_build_object('metric', r.metric, 'value', r.value, 'sample', r.sample_size, 'on', r.observed_on)), '[]') from experiment_results r where r.experiment_id = e.id) as results
        from experiments e where e.project_id = ${projectId} order by e.updated_at desc limit 10`;
      return { result: rows.map((r) => ({ name: r.name, hypothesis: clip(r.hypothesis), primaryMetric: r.primary_metric, threshold: r.decision_threshold, status: r.status, interpretation: clip(r.interpretation), results: r.results })), evidenceIds: [] };
    }
    case "list_boards": {
      const rows = await tx`select name, palette, content, updated_at from inspiration_boards where project_id = ${projectId} order by updated_at desc limit 5`;
      if (!rows.length) return { result: { error: "No inspiration boards yet." }, evidenceIds: [] };
      const card = (n: { type: string; data: Record<string, unknown> }) => {
        const d = n.data ?? {};
        switch (n.type) {
          case "image": return { type: "image", caption: clip(d.title, 120), source: d.sourceUrl ?? "none", colours: d.palette };
          case "note": return { type: "note", text: clip(d.text, 300) };
          case "link": return { type: "link", title: clip(d.title, 120), url: d.url, note: clip(d.note, 200) };
          case "entity": return { type: "qloo_entity", name: d.name, entityType: d.type, affinity: d.affinity };
          case "group": return { type: "group", label: d.label };
          default: return { type: n.type };
        }
      };
      return {
        result: rows.map((r) => ({ name: r.name, palette: r.palette, updatedAt: new Date(r.updated_at).toISOString(), cards: ((r.content?.nodes ?? []) as { type: string; data: Record<string, unknown> }[]).slice(0, 60).map(card) })),
        evidenceIds: [],
      };
    }
    case "list_research_runs": {
      const rows = await tx`select r.mode, r.status, r.created_at, r.error_message,
          (select count(*)::int from cultural_entities e where e.run_id = r.id and e.role = 'result') as entities,
          (select count(*)::int from cultural_entities e where e.run_id = r.id and e.role = 'tag') as tags
        from research_runs r where r.project_id = ${projectId} order by r.created_at desc limit 8`;
      return { result: rows.map((r) => ({ mode: r.mode, status: r.status, at: new Date(r.created_at).toISOString(), entities: r.entities, tags: r.tags, error: r.error_message })), evidenceIds: [] };
    }
  }
}

/** Short human label for the "steps" list shown under an answer. */
export function describeToolCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_evidence": return `Searched evidence for “${String(i.query ?? "").slice(0, 60)}”`;
    case "get_entity": return `Looked up “${String(i.name ?? "").slice(0, 60)}”`;
    case "list_opportunities": return "Read the opportunities";
    case "get_strategy": return "Read the strategy directions";
    case "list_experiments": return "Read the experiments";
    case "list_research_runs": return "Checked research run history";
    case "list_boards": return "Looked at the inspiration boards";
    default: return name;
  }
}
