import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { InsightsParams } from "@/lib/providers/qloo/client";
import { QlooError, type EntityTypeUrn, type NormalizedEntity, type NormalizedTag, type QlooCall } from "@/lib/providers/qloo/types";

/**
 * Live Qloo tools for the copilot. The stored evidence only holds what a research run asked
 * Qloo; these let the agent ask the taste graph new questions mid-conversation ("what else do
 * fans of X like in Japan?", "how do X fans differ from Y fans?"). Nothing is written: each
 * result gets a short ref (Q1, Q2…) that the answer cites, and the server keeps only refs the
 * tools really returned.
 */

export type QlooLike = {
  search(query: string, types?: EntityTypeUrn[], take?: number): Promise<QlooCall<NormalizedEntity[]>>;
  searchTags(query: string, take?: number): Promise<QlooCall<NormalizedTag[]>>;
  insights(p: InsightsParams): Promise<QlooCall<NormalizedEntity[]>>;
  tagInsights(p: Omit<InsightsParams, "filterType">): Promise<QlooCall<NormalizedTag[]>>;
};

/** One live result the answer may cite. */
export type QlooRef = { ref: string; name: string; type: string; affinity: number | null; asked: string };

const KINDS = ["brand", "artist", "movie", "tv_show", "book", "podcast", "video_game", "place", "destination", "person", "tag"] as const;
type Kind = (typeof KINDS)[number];
const KIND_LABEL: Record<Kind, string> = {
  brand: "brands", artist: "music artists", movie: "films", tv_show: "TV shows", book: "books", podcast: "podcasts",
  video_game: "video games", place: "places", destination: "destinations", person: "people", tag: "taste themes",
};

/** HTTP calls one question may make, so a curious agent can't burn the key's rate limit. */
export const QLOO_CALL_BUDGET = 12;

const name = z.string().trim().min(1).max(80);
const audience = z.object({
  likes: z.array(name).max(3).default([]),
  interests: z.array(name).max(3).default([]),
}).refine((a) => a.likes.length + a.interests.length > 0, "Give at least one thing the audience likes or is interested in.");
const location = z.string().trim().min(2).max(80).optional();
const kind = z.enum(KINDS);

const schemas = {
  qloo_find: z.object({ query: name, type: kind.exclude(["tag"]).optional() }),
  qloo_taste: z.object({ audience, find: kind, location, take: z.number().int().min(3).max(15).optional() }),
  qloo_compare: z.object({ a: audience, b: audience, find: kind, location }),
};
export type QlooToolName = keyof typeof schemas;
export const isQlooTool = (n: string): n is QlooToolName => n in schemas;

const audienceSchema = {
  type: "object",
  properties: {
    likes: { type: "array", items: { type: "string" }, description: "Up to 3 named things the audience likes: brands, artists, films, shows, places… e.g. [\"Glossier\", \"Phoebe Bridgers\"]." },
    interests: { type: "array", items: { type: "string" }, description: "Up to 3 free-text interests, e.g. [\"skincare\", \"vinyl\"]. Resolved to Qloo taste tags." },
  },
  additionalProperties: false,
} as const;
const findSchema = { type: "string", enum: [...KINDS], description: "What to recommend. \"tag\" returns taste themes (lifestyles, genres, keywords) instead of named entities." } as const;
const locationSchema = { type: "string", description: "Optional market, e.g. \"Tokyo\" or \"India\". Shifts the audience's taste to that place; for places and destinations it also limits results to it." } as const;

export const QLOO_TOOLS: Anthropic.Tool[] = [
  {
    name: "qloo_find",
    description: "Live Qloo lookup: check that a brand, artist, film, show, place etc. exists in Qloo's taste graph and how popular it is. Use it to confirm a name before relying on it.",
    input_schema: { type: "object", properties: { query: { type: "string" }, type: { type: "string", enum: KINDS.filter((k) => k !== "tag") } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "qloo_taste",
    description: "Live Qloo taste graph: for an audience described by what it likes and its interests, what else does it over-index on (by affinity)? Use it for questions the stored research did not ask: a new category, a new market, a new seed. Results carry refs (Q1…) to cite and say which seed drove each one.",
    input_schema: { type: "object", properties: { audience: audienceSchema, find: findSchema, location: locationSchema, take: { type: "integer", description: "3–15, default 8." } }, required: ["audience", "find"], additionalProperties: false },
  },
  {
    name: "qloo_compare",
    description: "Live Qloo taste graph: compare two audiences in one category. Returns what both share and what is distinctive to each, ranked by affinity. Use it for \"how do X fans differ from Y fans\" or to test whether a direction's audience is really distinct.",
    input_schema: { type: "object", properties: { a: audienceSchema, b: audienceSchema, find: findSchema, location: locationSchema }, required: ["a", "b", "find"], additionalProperties: false },
  },
];

export const QLOO_RULES = `You also have live Qloo tools (qloo_find, qloo_taste, qloo_compare) that query Qloo's taste graph directly. Use them when the stored evidence doesn't cover the question: a new category, market, seed or comparison. Prefer stored evidence when it already answers. Qloo affinity is correlation (what an audience over-indexes on), not purchase intent or causation; say so when it matters. Live results are not stored evidence: cite them in qlooRefs by their ref (e.g. "Q3"), never in citedEvidenceIds. Name the seeds you used, so the strategist can judge them.`;

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Per-question state: the client, the call budget and every ref handed out. */
export class QlooSession {
  readonly refs = new Map<string, QlooRef>();
  private calls = 0;
  constructor(private readonly client: QlooLike) {}

  private async spend<T>(fn: () => Promise<QlooCall<T>>): Promise<QlooCall<T>> {
    if (this.calls >= QLOO_CALL_BUDGET) throw new QlooError("This question has used its live Qloo lookups. Answer with what you have.", "rate_limited");
    this.calls++;
    return fn();
  }

  private ref(e: { name: string; type: string | null; affinity: number | null }, asked: string): string {
    const ref = `Q${this.refs.size + 1}`;
    this.refs.set(ref, { ref, name: e.name, type: e.type ?? "tag", affinity: r2(e.affinity), asked });
    return ref;
  }

  /** Resolves an audience to Qloo ids: each liked name to its top search match, each interest to its top tag. */
  private async resolve(a: z.infer<typeof audience>) {
    const found = await Promise.all(a.likes.map(async (q) => (await this.spend(() => this.client.search(q, [], 1))).data[0] ?? null));
    const foundTags = await Promise.all(a.interests.map(async (q) => (await this.spend(() => this.client.searchTags(q, 1))).data[0] ?? null));
    const seeds = found.filter((e): e is NormalizedEntity => Boolean(e));
    const tags = foundTags.filter((t): t is NormalizedTag => Boolean(t));
    const missing = [...a.likes.filter((_, i) => !found[i]), ...a.interests.filter((_, i) => !foundTags[i])];
    return { seeds, tags, missing, label: [...seeds.map((s) => s.name), ...tags.map((t) => t.name)].join(" + ") };
  }

  private async recommend(r: Awaited<ReturnType<QlooSession["resolve"]>>, find: Kind, location: string | undefined, take: number) {
    const base = { signalEntities: r.seeds.map((s) => s.providerId), signalTags: r.tags.map((t) => t.providerId), take };
    if (find === "tag") {
      const res = await this.spend(() => this.client.tagInsights({ ...base, signalLocationQuery: location }));
      return res.data.map((t) => ({ name: t.name, type: t.type, affinity: t.affinity, because: [] as string[] }));
    }
    const place = find === "place" || find === "destination";
    const res = await this.spend(() => this.client.insights({
      ...base, filterType: `urn:entity:${find}` as EntityTypeUrn, explainability: true,
      excludeEntities: base.signalEntities, signalLocationQuery: place ? undefined : location, filterLocationQuery: place ? location : undefined,
    }));
    const seedName = new Map(r.seeds.map((s) => [s.providerId, s.name]));
    return res.data.map((e) => ({
      name: e.name, type: e.type, affinity: e.affinity,
      because: e.explainability.filter((x) => seedName.has(x.entityId)).sort((x, y) => y.score - x.score).map((x) => seedName.get(x.entityId)!),
    }));
  }

  async run(name: string, raw: unknown): Promise<{ result: unknown; refs: string[] }> {
    if (!isQlooTool(name)) return { result: { error: `Unknown tool ${name}` }, refs: [] };
    const parsed = schemas[name].safeParse(raw ?? {});
    if (!parsed.success) return { result: { error: "Invalid input", issues: parsed.error.issues.map((i) => i.message) }, refs: [] };
    try {
      switch (name) {
        case "qloo_find": {
          const i = parsed.data as z.infer<typeof schemas.qloo_find>;
          const res = await this.spend(() => this.client.search(i.query, i.type ? [`urn:entity:${i.type}` as EntityTypeUrn] : [], 5));
          if (!res.data.length) return { result: { error: `Qloo has no match for “${i.query}”.` }, refs: [] };
          return { result: res.data.map((e) => ({ name: e.name, type: e.type, popularity: r2(e.popularity), disambiguation: e.disambiguation, tags: e.tags.slice(0, 6) })), refs: [] };
        }
        case "qloo_taste": {
          const i = parsed.data as z.infer<typeof schemas.qloo_taste>;
          const r = await this.resolve(i.audience);
          if (!r.seeds.length && !r.tags.length) return { result: { error: `Qloo recognised none of: ${r.missing.join(", ")}.` }, refs: [] };
          const asked = `${KIND_LABEL[i.find]} for fans of ${r.label}${i.location ? ` in ${i.location}` : ""}`;
          const list = await this.recommend(r, i.find, i.location, i.take ?? 8);
          const rows = list.map((e) => ({ ref: this.ref(e, asked), ...e, affinity: r2(e.affinity) }));
          return { result: { asked, seedsUsed: r.label, notRecognised: r.missing, results: rows }, refs: rows.map((x) => x.ref) };
        }
        case "qloo_compare": {
          const i = parsed.data as z.infer<typeof schemas.qloo_compare>;
          const [ra, rb] = [await this.resolve(i.a), await this.resolve(i.b)];
          if ((!ra.seeds.length && !ra.tags.length) || (!rb.seeds.length && !rb.tags.length)) {
            return { result: { error: `Qloo recognised none of: ${[...ra.missing, ...rb.missing].join(", ")}.` }, refs: [] };
          }
          const [la, lb] = await Promise.all([this.recommend(ra, i.find, i.location, 15), this.recommend(rb, i.find, i.location, 15)]);
          const inB = new Map(lb.map((e) => [e.name.toLowerCase(), e]));
          const inA = new Set(la.map((e) => e.name.toLowerCase()));
          const where = i.location ? ` in ${i.location}` : "";
          const shared = la.filter((e) => inB.has(e.name.toLowerCase())).slice(0, 6).map((e) => {
            const b = inB.get(e.name.toLowerCase())!;
            return { ref: this.ref(e, `${KIND_LABEL[i.find]} both ${ra.label} and ${rb.label} fans like${where}`), name: e.name, affinityA: r2(e.affinity), affinityB: r2(b.affinity) };
          });
          const only = (list: typeof la, other: Set<string> | Map<string, unknown>, label: string) => list.filter((e) => !other.has(e.name.toLowerCase())).slice(0, 6)
            .map((e) => ({ ref: this.ref(e, `${KIND_LABEL[i.find]} distinctive to ${label} fans${where}`), name: e.name, affinity: r2(e.affinity) }));
          const onlyA = only(la, inB, ra.label);
          const onlyB = only(lb, inA, rb.label);
          return {
            result: { audienceA: ra.label, audienceB: rb.label, notRecognised: [...ra.missing, ...rb.missing], shared, onlyA, onlyB, overlap: `${shared.length} of the top ${Math.min(la.length, lb.length)} are shared` },
            refs: [...shared, ...onlyA, ...onlyB].map((x) => x.ref),
          };
        }
      }
    } catch (e) {
      return { result: { error: e instanceof QlooError ? e.message : "The Qloo lookup failed." }, refs: [] };
    }
  }
}

/** Short human label for the steps list. */
export function describeQlooCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const who = (a: unknown) => {
    const o = (a ?? {}) as { likes?: unknown; interests?: unknown };
    return [...(Array.isArray(o.likes) ? o.likes : []), ...(Array.isArray(o.interests) ? o.interests : [])].map(String).join(" + ").slice(0, 60) || "an audience";
  };
  const what = KIND_LABEL[i.find as Kind] ?? "matches";
  const where = typeof i.location === "string" && i.location ? ` in ${i.location.slice(0, 30)}` : "";
  switch (name) {
    case "qloo_find": return `Checked Qloo for “${String(i.query ?? "").slice(0, 60)}”`;
    case "qloo_taste": return `Asked Qloo which ${what} fans of ${who(i.audience)} like${where}`;
    case "qloo_compare": return `Asked Qloo to compare ${who(i.a)} fans with ${who(i.b)} fans on ${what}${where}`;
    default: return name;
  }
}
