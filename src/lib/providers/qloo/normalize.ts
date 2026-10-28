import { rawEntitySchema, rawTagSchema, type NormalizedEntity, type NormalizedTag } from "./types";

export function shortType(urn: string | undefined | null): string {
  if (!urn) return "entity";
  return urn.replace(/^urn:entity:/, "").replace(/^urn:tag:/, "tag:").replace(/^urn:/, "");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Explainability: [{entity_id, score}] lists, possibly keyed by signal name. */
export function parseExplainability(exp: unknown): { entityId: string; score: number }[] {
  const out: { entityId: string; score: number }[] = [];
  const visit = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const id = String(o.entity_id ?? o.id ?? "");
      const score = num(o.score ?? o.weight ?? o.affinity ?? o.value);
      if (id && score !== null) out.push({ entityId: id, score });
    }
  };
  if (Array.isArray(exp)) visit(exp);
  else if (exp && typeof exp === "object") Object.values(exp as Record<string, unknown>).forEach(visit);
  return out;
}

/** results.entities | results (array) | results.<key> — tolerate known variants. */
export function extractList(payload: unknown, key: "entities" | "tags"): unknown[] | null {
  if (!payload || typeof payload !== "object") return null;
  const results = (payload as Record<string, unknown>).results;
  if (Array.isArray(results)) return results;
  if (results && typeof results === "object") {
    const v = (results as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v;
    return [];
  }
  return null;
}

export function normalizeEntity(raw: unknown): NormalizedEntity | null {
  const parsed = rawEntitySchema.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  const props = (e.properties ?? {}) as Record<string, unknown>;
  const typeUrn = e.subtype ?? e.type ?? e.types?.find((t) => t.startsWith("urn:entity:"));
  const tags = (e.tags ?? [])
    .map((t) => (typeof t === "string" ? t : (t.name ?? "").trim()))
    .filter(Boolean)
    .slice(0, 10);
  const description = typeof props.short_description === "string" ? props.short_description : typeof props.description === "string" ? props.description : null;
  return {
    providerId: String(e.entity_id ?? e.id),
    name: e.name.trim(),
    type: shortType(typeUrn),
    affinity: num(e.query?.affinity),
    popularity: num(e.popularity),
    tags,
    description: description ? description.slice(0, 600) : null,
    disambiguation: e.disambiguation ?? null,
    explainability: parseExplainability(e.query?.explainability),
  };
}

export function normalizeTag(raw: unknown): NormalizedTag | null {
  const parsed = rawTagSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  const id = t.tag_id ?? t.id;
  if (!id) return null;
  return { providerId: id, name: t.name.trim(), type: t.subtype ?? t.type ?? null, affinity: num(t.query?.affinity), popularity: num(t.popularity) };
}
