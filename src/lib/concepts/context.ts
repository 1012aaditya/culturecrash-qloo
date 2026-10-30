import "server-only";
import type { Tx } from "@/lib/db";

/**
 * What a concept frame is built from, stored on the job as its evidence trail: the direction it
 * visualises, the audience's Qloo taste signals, the direction's cited evidence, and the exact prompt.
 */
export type Provenance = {
  direction: { id: string; slot: number; name: string; coreIdea: string } | null;
  signals: { name: string; affinity: number | null }[];
  connections: string[];
  evidence: { id: string; claim: string; source: string | null; url: string | null }[];
  prompt: string;
  /** Shot name and why it expresses the direction (written by the AI art director). */
  title?: string;
  why?: string;
  /** Where the card goes on the board: inside a group, or beside the card it improves on. */
  placement?: { group?: string; anchor?: string };
  improvement?: { fromLevel: string; fromRationale: string; diagnosis: string; changes: string[] };
};

export type DirectionFacts = {
  id: string; slot: number; name: string; coreIdea: string; audienceContext: string; creativeImplications: string;
  connections: string[]; evidenceIds: string[];
};
export type ConceptContext = {
  brief: { brand: string | null; category: string | null; audience: string | null };
  signals: { name: string; affinity: number | null }[];
};

export const SAFETY = "Editorial photograph, natural light, real textures, no text, no logos, no recognisable people.";

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function directionFacts(row: Record<string, unknown>): DirectionFacts {
  const c = (row.content ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string, slot: Number(row.slot), name: s(row.name, 120), coreIdea: s(c.coreIdea, 400),
    audienceContext: s(c.audienceContext, 400), creativeImplications: s(c.creativeImplications, 600),
    connections: Array.isArray(c.culturalConnections) ? c.culturalConnections.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120)).slice(0, 6) : [],
    evidenceIds: ((row.evidence_ids as string[] | null) ?? []).slice(0, 12),
  };
}

/** Brief and the strongest Qloo taste tags of the latest completed research run. */
export async function loadContext(tx: Tx, projectId: string): Promise<ConceptContext> {
  const [brief] = await tx`select brand, category, audience from campaign_briefs where project_id = ${projectId}`;
  const [run] = await tx`select id from research_runs where project_id = ${projectId} and status in ('completed', 'partially_completed') order by created_at desc limit 1`;
  const tags = run ? await tx`select name, affinity from cultural_entities where run_id = ${run.id} and role = 'tag' order by affinity desc nulls last limit 12` : [];
  return {
    brief: { brand: (brief?.brand as string | null) ?? null, category: (brief?.category as string | null) ?? null, audience: brief?.audience ? s(brief.audience, 300) : null },
    signals: tags.map((t) => ({ name: t.name as string, affinity: t.affinity === null ? null : Number(t.affinity) })),
  };
}

/** A direction by id (any revision), or the project's selected one when no id is given. */
export async function loadDirection(tx: Tx, projectId: string, directionId: string | null): Promise<DirectionFacts | null> {
  const [row] = await tx`select id, slot, name, content, evidence_ids from strategy_directions
    where project_id = ${projectId} and id = coalesce(${directionId}::uuid, (select selected_direction_id from projects where id = ${projectId}))`;
  return row ? directionFacts(row) : null;
}

/** The current strategy version's directions: the selected or newest revision per slot. */
export async function currentDirections(tx: Tx, projectId: string): Promise<{ version: number; directions: DirectionFacts[] } | null> {
  const [v] = await tx`select id, version from strategy_versions where project_id = ${projectId} order by version desc limit 1`;
  if (!v) return null;
  const rows = await tx`select distinct on (slot) id, slot, name, content, evidence_ids from strategy_directions
    where version_id = ${v.id} order by slot, (status = 'selected') desc, revision desc`;
  return { version: Number(v.version), directions: rows.map(directionFacts) };
}

export async function loadEvidence(tx: Tx, ids: string[]): Promise<Provenance["evidence"]> {
  if (!ids.length) return [];
  const rows = await tx`select id, claim, source_provider, source_url from evidence_items where id = any(${ids}) limit 4`;
  return rows.map((r) => ({ id: r.id as string, claim: s(r.claim, 300), source: (r.source_provider as string | null) ?? null, url: (r.source_url as string | null) ?? null }));
}

/** The prompt used without an AI art director: brief, direction, cues and palette in plain words. */
export function basePrompt(ctx: ConceptContext, dir: DirectionFacts | null, colours: string[]) {
  const { brand, category, audience } = ctx.brief;
  const cues = dir?.connections.length ? dir.connections.slice(0, 4) : ctx.signals.slice(0, 5).map((t) => t.name);
  return [
    `Editorial campaign photograph${brand ? ` for ${brand}` : ""}${category ? `, a ${category} brand` : ""}.`,
    dir ? `Concept: ${dir.coreIdea || dir.name}.` : "",
    audience ? `Audience: ${audience.slice(0, 200)}.` : "",
    cues.length ? `Cultural cues: ${cues.join(", ")}.` : "",
    colours.length ? `Colour palette: ${colours.join(", ")}.` : "",
    "Natural light, real textures, no text, no logos, no recognisable people.",
  ].filter(Boolean).join(" ").slice(0, 2000);
}

export function provenanceFor(ctx: ConceptContext, dir: DirectionFacts | null, evidence: Provenance["evidence"], prompt: string, extra: Partial<Provenance> = {}): Provenance {
  return {
    direction: dir ? { id: dir.id, slot: dir.slot, name: dir.name, coreIdea: dir.coreIdea } : null,
    signals: ctx.signals.slice(0, 8),
    connections: dir?.connections ?? [],
    evidence,
    prompt,
    ...extra,
  };
}
