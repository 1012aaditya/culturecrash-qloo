import { z } from "zod";
import type { BriefInput } from "@/lib/ai/template";
import { isTechBrief, pickWebSearch, ROUTES, type ProviderInfo } from "./registry";
import type { Depth, Intent, ProviderKey, QlooPick, ResearchPlanV2, ResearchQuestion } from "./types";

const QUESTION_CAP: Record<Depth, number> = { quick: 3, standard: 5, deep: 7 };
const QUERIES_PER_QUESTION: Record<Depth, number> = { quick: 1, standard: 2, deep: 2 };

const COUNTRY: Record<string, string> = {
  india: "in", "united states": "us", usa: "us", us: "us", "united kingdom": "gb", uk: "gb", britain: "gb", england: "gb",
  canada: "ca", australia: "au", germany: "de", france: "fr", spain: "es", italy: "it", japan: "jp", brazil: "br", mexico: "mx",
  singapore: "sg", "south korea": "kr", korea: "kr", netherlands: "nl", sweden: "se", "south africa": "za", nigeria: "ng", indonesia: "id", uae: "ae",
};
export function countryCode(market: string | null | undefined): string | null {
  if (!market) return null;
  const m = market.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY)) if (new RegExp(`\\b${name}\\b`).test(m)) return code;
  return null;
}

/** Guess the intent of a free-text research question (used for the user's own question). */
export function inferIntent(q: string): Intent {
  const t = q.toLowerCase();
  if (/competitor|rival|versus|\bvs\b|positioning of/.test(t)) return "competitor";
  if (/creator|influencer|youtube|tiktok|video/.test(t)) return "creator";
  if (/reddit|communit|forum|frustrat|complain|talk about/.test(t)) return "community";
  if (/trend|emerg|rising|shift|growing|declin/.test(t)) return "trend";
  if (/audience|gen ?z|millennial|consumer|customer|people who/.test(t)) return "audience";
  return "culture";
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Rule-based plan (always available, deterministic). Questions are distinct and adapted to the
 * brief: competitor questions only when competitors exist, brand-context only when documents exist.
 */
export function rulesPlan(b: BriefInput, opts: { objective: string | null; depth: Depth; freshness: "month" | "year" | "any"; hasBrandDocs: boolean; year?: number }): ResearchQuestion[] {
  const year = opts.year ?? new Date().getFullYear();
  const brand = b.brand ?? b.name;
  const cat = b.category ?? b.product ?? brand;
  const mkt = b.market ? ` ${b.market}` : "";
  const aud = b.audience ? clean(b.audience).split(/[.,;]/)[0].slice(0, 60) : null;
  const interests = (b.interests ?? []).slice(0, 2);
  const qs: Omit<ResearchQuestion, "key">[] = [];
  if (opts.objective) qs.push({ text: clean(opts.objective), intent: inferIntent(opts.objective), priority: 1, origin: "user", queries: [clean(`${opts.objective}`).slice(0, 120)] });
  if (aud) qs.push({ text: `What do ${aud}${mkt ? ` in${mkt}` : ""} value, need or struggle with in ${cat}?`, intent: "audience", priority: 1, queries: [`${aud} ${cat}${mkt}`, `${cat}${mkt} consumer attitudes ${year}`] });
  if (b.competitors.length) qs.push({ text: `How do ${b.competitors.slice(0, 3).join(", ")} position themselves and what do they communicate?`, intent: "competitor", priority: 1, queries: b.competitors.slice(0, 2).map((c) => `${c} brand positioning campaign`) });
  // Counter-evidence is asked at every depth; mergeQuestions guarantees it a place.
  qs.push({ text: `What evidence challenges the obvious direction for ${brand} — criticism, fatigue or backlash in ${cat}?`, intent: "counterevidence", priority: 2, queries: [`${cat} backlash criticism`, `${cat} overrated`] });
  qs.push({ text: `How do people talk about ${cat} online — recurring frustrations, questions and language?`, intent: "community", priority: 2, queries: [`${cat} frustrations`, `${cat} what people want`] });
  qs.push({ text: `What has changed recently in ${cat}${mkt}?`, intent: "trend", priority: 2, queries: [`${cat}${mkt} trend ${year}`, `${cat} market shift ${year}`] });
  if (interests.length) qs.push({ text: `How do ${interests.join(" and ")} connect culturally to ${cat}?`, intent: "culture", priority: 2, queries: interests.map((i) => `${i} ${cat} culture`) });
  qs.push({ text: `What are creators saying about ${cat}?`, intent: "creator", priority: 3, queries: [`${cat} review creator`, `${cat} routine`] });
  if (opts.hasBrandDocs) qs.push({ text: `What do our own brand documents say about ${brand}'s positioning and audience?`, intent: "brand_context", priority: 1, queries: [`${brand} positioning audience values`] });

  const sorted = qs.sort((a, b2) => a.priority - b2.priority).slice(0, QUESTION_CAP[opts.depth]);
  return sorted.map((q, i) => ({ ...q, key: `q${i + 1}`, queries: q.queries.map((x) => clean(x).slice(0, 160)).slice(0, QUERIES_PER_QUESTION[opts.depth]) }));
}

/** Which providers answer each question: the primary configured provider per routed capability. */
/** At most this many providers answer one question — more sources per question rarely pays for itself. */
const MAX_PROVIDERS_PER_QUESTION = 3;

export function selectProviders(questions: ResearchQuestion[], registry: ProviderInfo[], demo: boolean, opts: { tech?: boolean } = {}): { providers: ProviderKey[]; skipped: { provider: ProviderKey; reason: string }[]; byQuestion: Record<string, ProviderKey[]> } {
  const web = pickWebSearch(registry, demo);
  const byCap = (cap: string): ProviderKey | null => {
    if (cap === "web_search") return web;
    if (demo) return null; // demo runs only use the labelled fixture web provider (+ client documents)
    if (cap === "tech_community" && !opts.tech) return null; // Hacker News only for technology briefs
    const key = registry.find((p) => p.capability === cap && p.configured)?.key ?? null;
    return key === web ? null : key; // Exa as the semantic complement only when it isn't already the web provider
  };
  const byQuestion: Record<string, ProviderKey[]> = {};
  for (const q of questions) {
    const chosen = [...new Set(ROUTES[q.intent].map(byCap).filter((k): k is ProviderKey => Boolean(k)))].slice(0, MAX_PROVIDERS_PER_QUESTION);
    // Brand-context questions use client documents only; everything else gets at least web search when available.
    if (q.intent === "brand_context") byQuestion[q.key] = ["brand_docs"];
    else byQuestion[q.key] = chosen.length ? chosen : web ? [web] : [];
  }
  const providers = [...new Set(Object.values(byQuestion).flat())];
  const skipped = registry
    .filter((p) => !providers.includes(p.key) && p.key !== "demo_web")
    .map((p) => ({
      provider: p.key,
      reason: !p.configured ? p.unavailableReason ?? "Not configured"
        : p.capability === "tech_community" && !opts.tech ? "Only used for technology, AI or startup briefs"
        : p.capability === "web_search" ? `Another web-search provider (${web}) is used for this job`
        : "Not relevant to these questions",
    }));
  return { providers, skipped, byQuestion };
}

export const llmPlanSchema = z.object({
  questions: z.array(z.object({
    text: z.string(),
    intent: z.enum(["competitor", "community", "creator", "culture", "trend", "brand_context", "audience", "counterevidence"]),
    priority: z.number().int(),
    queries: z.array(z.string()),
  })),
});

/** Validates and caps an LLM-proposed plan; falls back to the rules plan's keys and limits. */
export function sanitizeLlmPlan(out: z.infer<typeof llmPlanSchema>, depth: Depth, hasBrandDocs: boolean): ResearchQuestion[] {
  return out.questions
    .filter((q) => q.text.trim().length > 8 && q.queries.some((x) => x.trim()) && (q.intent !== "brand_context" || hasBrandDocs))
    .slice(0, QUESTION_CAP[depth])
    .map((q, i) => ({
      key: `q${i + 1}`, text: clean(q.text).slice(0, 300), intent: q.intent, priority: (Math.min(3, Math.max(1, q.priority)) as 1 | 2 | 3),
      queries: q.queries.map((x) => clean(x).slice(0, 160)).filter(Boolean).slice(0, QUERIES_PER_QUESTION[depth]),
    }));
}

export function buildPlanV2(b: BriefInput, opts: { objective: string | null; depth: Depth; freshness: "month" | "year" | "any"; hasBrandDocs: boolean; registry: ProviderInfo[]; demo: boolean; llmQuestions?: ResearchQuestion[] | null; qlooQuestions?: ResearchQuestion[] }): ResearchPlanV2 & { byQuestion: Record<string, ProviderKey[]> } {
  const rules = rulesPlan(b, opts);
  let briefQs = opts.llmQuestions?.length ? opts.llmQuestions : rules;
  // A model-written plan must still contain the user's own question and a counter-evidence question.
  if (opts.llmQuestions?.length) {
    const userQ = rules.find((q) => q.origin === "user");
    const counter = rules.find((q) => q.intent === "counterevidence");
    if (userQ && !briefQs.some((q) => q.text === userQ.text)) briefQs = [userQ, ...briefQs];
    if (counter && !briefQs.some((q) => q.intent === "counterevidence")) briefQs = [...briefQs, counter];
  }
  const questions = mergeQuestions(opts.qlooQuestions ?? [], briefQs, opts.depth);
  const tech = isTechBrief([b.category, b.product, b.brand, opts.objective].filter(Boolean).join(" "));
  const sel = selectProviders(questions, opts.registry, opts.demo, { tech });
  const notes: string[] = [];
  if (!sel.providers.some((p) => p !== "brand_docs")) notes.push("No web, video or community provider is configured, so only client documents (and Qloo, if configured) can be used.");
  if (opts.qlooQuestions?.length) notes.push(`${opts.qlooQuestions.length} question(s) investigate entities Qloo returned for this brief.`);
  else notes.push("No Qloo results were available to seed the research; questions come from the brief only.");
  return {
    objective: opts.objective ?? `Understand the cultural context for ${b.brand ?? b.name}${b.market ? ` in ${b.market}` : ""}.`,
    depth: opts.depth, questions, geography: b.market ?? null,
    timeframe: { freshness: opts.freshness, label: opts.freshness === "month" ? "Past month" : opts.freshness === "year" ? "Past year" : "Any time" },
    providers: sel.providers, skipped: sel.skipped, notes, planner: opts.llmQuestions?.length ? "llm" : "rules", byQuestion: sel.byQuestion,
  };
}

/** How many Qloo results each depth investigates externally. */
export const QLOO_PICKS: Record<Depth, number> = { quick: 1, standard: 2, deep: 4 };

const TYPE_LABEL: Record<string, string> = {
  artist: "artist", person: "public figure", movie: "film", tv_show: "TV show", podcast: "podcast", book: "book", video_game: "video game",
  brand: "brand", place: "place", destination: "destination", tag: "taste tag",
};
/** Which kind of external evidence fits a Qloo entity type. */
const TYPE_INTENT: Record<string, Intent> = {
  artist: "creator", person: "creator", podcast: "creator", tv_show: "creator", movie: "creator", video_game: "creator", book: "culture",
  brand: "competitor", place: "culture", destination: "culture", tag: "community",
};

/**
 * Picks the Qloo results worth investigating, deterministically. Affinity scores come from separate
 * Qloo queries per entity type and are not comparable across types, so picks rotate through types,
 * strongest result of each first, plus the strongest taste tag. Second-hop "orbit" entities are
 * never picked: their score is relative to another entity, not to this audience.
 */
export function pickQlooEntities(rows: QlooPick[], n: number): QlooPick[] {
  const byType = new Map<string, QlooPick[]>();
  for (const r of rows.filter((x) => x.role === "result" && x.affinity !== null && x.tier !== "subcultural_orbit")) {
    byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  }
  const queues = [...byType.values()].map((l) => l.sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)))
    .sort((a, b) => (b[0].affinity ?? 0) - (a[0].affinity ?? 0));
  const tag = rows.filter((r) => r.role === "tag" && r.affinity !== null).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))[0];
  const want = n > 1 && tag ? n - 1 : n;
  const picks: QlooPick[] = [];
  for (let i = 0; picks.length < want && queues.some((q) => q.length > i); i++) {
    for (const q of queues) if (q[i] && picks.length < want) picks.push(q[i]);
  }
  if (n > 1 && tag) picks.push(tag);
  return picks.slice(0, n);
}

/** One research question per picked Qloo entity, routed by entity type. */
export function qlooQuestions(picks: QlooPick[], b: BriefInput): ResearchQuestion[] {
  const brand = b.brand ?? b.name;
  const cat = b.category ?? b.product ?? "";
  const aud = b.audience ? clean(b.audience).split(/[.,;]/)[0].slice(0, 50) : null;
  return picks.map((p, i) => {
    const kind = TYPE_LABEL[p.type] ?? p.type;
    return {
      key: `k${i + 1}`, origin: "qloo" as const, priority: (i < 2 ? 1 : 2) as 1 | 2, intent: TYPE_INTENT[p.type] ?? "culture",
      text: `Qloo links the ${kind} “${p.name}” to this audience${p.affinity !== null ? ` (affinity ${p.affinity.toFixed(2)})` : ""}. What public context explains that connection, and could it matter for ${brand}?`,
      queries: [clean(`${p.name} ${cat}`), clean(`${p.name} ${aud ?? b.market ?? "fans"}`)].map((x) => x.slice(0, 160)),
      qlooEntityIds: [p.entityId], qlooEvidenceIds: p.evidenceId ? [p.evidenceId] : [],
    };
  });
}

/**
 * Fits Qloo-seeded and brief questions into the depth's cap. The user's own question and the
 * counter-evidence question are always kept (a plan that can't be challenged isn't research), then
 * Qloo questions, then the remaining brief questions by priority.
 */
export function mergeQuestions(qloo: ResearchQuestion[], brief: ResearchQuestion[], depth: Depth): ResearchQuestion[] {
  const cap = QUESTION_CAP[depth];
  const fromBrief = brief.map((q) => ({ ...q, origin: q.origin ?? ("brief" as const) }));
  const must = fromBrief.filter((q) => q.origin === "user" || q.intent === "counterevidence").slice(0, cap);
  const rest = fromBrief.filter((q) => !must.includes(q)).sort((a, b) => a.priority - b.priority);
  const room = cap - must.length;
  // Qloo questions fill the room, except one slot kept for the top brief question (audience or competitors).
  const qlooRoom = Math.max(0, room - (rest.length && room >= 2 ? 1 : 0));
  const qlooQs = qloo.slice(0, qlooRoom).map((q) => ({ ...q, queries: q.queries.slice(0, QUERIES_PER_QUESTION[depth]) }));
  const chosen = [...must.filter((q) => q.origin === "user"), ...qlooQs, ...rest.slice(0, cap - must.length - qlooQs.length), ...must.filter((q) => q.origin !== "user")];
  return chosen.map((q, i) => ({ ...q, key: `q${i + 1}` }));
}

/**
 * Takes items from each group in turn (first of every group, then second, …) up to `limit`, so no
 * group can use up a shared budget before the others get anything.
 */
export function shareAcross<T>(groups: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < limit && groups.some((g) => g.length > i); i++) {
    for (const g of groups) if (g[i] !== undefined && out.length < limit) out.push(g[i]);
  }
  return out;
}

/** Share of a multi-round job's provider calls that round 1 may use; the rest is kept for follow-ups. */
export const FIRST_ROUND_SHARE = 0.75;
