import { z } from "zod";
import type { BriefInput } from "@/lib/ai/template";
import { pickWebSearch, ROUTES, type ProviderInfo } from "./registry";
import type { Depth, Intent, ProviderKey, ResearchPlanV2, ResearchQuestion } from "./types";

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
  if (opts.objective) qs.push({ text: clean(opts.objective), intent: inferIntent(opts.objective), priority: 1, queries: [clean(`${opts.objective}`).slice(0, 120)] });
  if (aud) qs.push({ text: `What do ${aud}${mkt ? ` in${mkt}` : ""} value, need or struggle with in ${cat}?`, intent: "audience", priority: 1, queries: [`${aud} ${cat}${mkt}`, `${cat}${mkt} consumer attitudes ${year}`] });
  if (b.competitors.length) qs.push({ text: `How do ${b.competitors.slice(0, 3).join(", ")} position themselves and what do they communicate?`, intent: "competitor", priority: 1, queries: b.competitors.slice(0, 2).map((c) => `${c} brand positioning campaign`) });
  // Counter-evidence comes first among secondary questions so it survives the per-depth cap.
  if (opts.depth !== "quick") qs.push({ text: `What evidence challenges the obvious direction for ${brand} — criticism, fatigue or backlash in ${cat}?`, intent: "counterevidence", priority: 2, queries: [`${cat} backlash criticism`, `${cat} overrated`] });
  qs.push({ text: `How do people talk about ${cat} online — recurring frustrations, questions and language?`, intent: "community", priority: 2, queries: [`${cat} frustrations`, `${cat} what people want`] });
  qs.push({ text: `What has changed recently in ${cat}${mkt}?`, intent: "trend", priority: 2, queries: [`${cat}${mkt} trend ${year}`, `${cat} market shift ${year}`] });
  if (interests.length) qs.push({ text: `How do ${interests.join(" and ")} connect culturally to ${cat}?`, intent: "culture", priority: 2, queries: interests.map((i) => `${i} ${cat} culture`) });
  qs.push({ text: `What are creators saying about ${cat}?`, intent: "creator", priority: 3, queries: [`${cat} review creator`, `${cat} routine`] });
  if (opts.hasBrandDocs) qs.push({ text: `What do our own brand documents say about ${brand}'s positioning and audience?`, intent: "brand_context", priority: 1, queries: [`${brand} positioning audience values`] });

  const sorted = qs.sort((a, b2) => a.priority - b2.priority).slice(0, QUESTION_CAP[opts.depth]);
  return sorted.map((q, i) => ({ ...q, key: `q${i + 1}`, queries: q.queries.map((x) => clean(x).slice(0, 160)).slice(0, QUERIES_PER_QUESTION[opts.depth]) }));
}

/** Which providers answer each question: the primary configured provider per routed capability. */
export function selectProviders(questions: ResearchQuestion[], registry: ProviderInfo[], demo: boolean): { providers: ProviderKey[]; skipped: { provider: ProviderKey; reason: string }[]; byQuestion: Record<string, ProviderKey[]> } {
  const web = pickWebSearch(registry, demo);
  const byCap = (cap: string): ProviderKey | null => {
    if (cap === "web_search") return web;
    if (demo) return null; // demo runs only use the labelled fixture web provider (+ client documents)
    return registry.find((p) => p.capability === cap && p.configured)?.key ?? null;
  };
  const byQuestion: Record<string, ProviderKey[]> = {};
  for (const q of questions) {
    const caps = ROUTES[q.intent];
    const chosen = caps.map(byCap).filter((k): k is ProviderKey => Boolean(k));
    // Brand-context questions use client documents only; everything else gets at least web search when available.
    if (q.intent === "brand_context") byQuestion[q.key] = ["brand_docs"];
    else byQuestion[q.key] = [...new Set(chosen.length ? chosen : web ? [web] : [])];
  }
  const providers = [...new Set(Object.values(byQuestion).flat())];
  const skipped = registry
    .filter((p) => !providers.includes(p.key) && p.key !== "demo_web" && !(web && p.capability === "web_search"))
    .map((p) => ({ provider: p.key, reason: p.unavailableReason ?? "Not relevant to these questions" }));
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

export function buildPlanV2(b: BriefInput, opts: { objective: string | null; depth: Depth; freshness: "month" | "year" | "any"; hasBrandDocs: boolean; registry: ProviderInfo[]; demo: boolean; llmQuestions?: ResearchQuestion[] | null }): ResearchPlanV2 & { byQuestion: Record<string, ProviderKey[]> } {
  const questions = opts.llmQuestions?.length ? opts.llmQuestions : rulesPlan(b, opts);
  const sel = selectProviders(questions, opts.registry, opts.demo);
  const notes: string[] = [];
  if (!sel.providers.some((p) => p !== "brand_docs")) notes.push("No web, video or community provider is configured, so only client documents (and Qloo, if configured) can be used.");
  return {
    objective: opts.objective ?? `Understand the cultural context for ${b.brand ?? b.name}${b.market ? ` in ${b.market}` : ""}.`,
    depth: opts.depth, questions, geography: b.market ?? null,
    timeframe: { freshness: opts.freshness, label: opts.freshness === "month" ? "Past month" : opts.freshness === "year" ? "Past year" : "Any time" },
    providers: sel.providers, skipped: sel.skipped, notes, planner: opts.llmQuestions?.length ? "llm" : "rules", byQuestion: sel.byQuestion,
  };
}
