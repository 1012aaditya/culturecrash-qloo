import type { Hit, ProviderCall } from "../types";

/**
 * DEMONSTRATION web results — fictional sources on example.org/.test domains, used only for
 * explicitly requested demo runs (CC_DEMO_MODE=enabled, never production). Every document and
 * claim built from them is stored with is_demo=true and labelled in the UI.
 */
const FIXTURES: Omit<Hit, "provider">[] = [
  { sourceType: "demo_fixture", url: "https://news.example.org/gen-z-skincare-rituals", externalId: null, title: "Why Gen Z treats skincare as a daily ritual (demo)", snippet: "Fictional article: younger buyers describe their routines as quiet time for themselves rather than a beauty obligation. Several interviewees said ingredient transparency matters more than brand heritage.", publisher: "Example News (demo)", publishedAt: "2026-08-14T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://syndicate.example.org/gen-z-skincare-rituals-copy", externalId: null, title: "Why Gen Z treats skincare as a daily ritual (demo)", snippet: "Fictional article: younger buyers describe their routines as quiet time for themselves rather than a beauty obligation. Several interviewees said ingredient transparency matters more than brand heritage.", publisher: "Example Syndicate (demo)", publishedAt: "2026-08-15T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content (syndicated copy)." },
  { sourceType: "demo_fixture", url: "https://forum.example.org/t/routine-fatigue", externalId: null, title: "Anyone else tired of 10-step routines? (demo)", snippet: "Fictional community thread: posters say long routines feel like homework and that they are switching to two or three products they trust.", publisher: "Example Forum (demo)", publishedAt: "2026-09-02T00:00:00.000Z", language: "en", metrics: { score: 412, comments: 96 }, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://brand.example.org/about", externalId: null, title: "Competitor A — Our story (demo)", snippet: "Fictional brand page: the competitor positions itself on clinical efficacy and dermatologist testing, with little mention of ritual or self-expression.", publisher: "Competitor A (demo)", publishedAt: null, language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://video.example.org/watch/demo123", externalId: "demo123", title: "My calm-morning skincare routine (demo)", snippet: "Fictional creator video description: a slow, minimal routine filmed as a mindfulness moment; comments ask for product lists.", publisher: "Demo Creator", publishedAt: "2026-07-20T00:00:00.000Z", language: "en", metrics: { views: 182000, likes: 9400 }, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://opinion.example.org/clean-beauty-backlash", externalId: null, title: "The clean-beauty backlash is here (demo)", snippet: "Fictional opinion piece: critics argue 'clean' labels are marketing, and some younger buyers now distrust brands that lean on them. A counterpoint to ritual-led positioning.", publisher: "Example Opinion (demo)", publishedAt: "2026-09-18T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://trends.example.org/skincare-2026", externalId: null, title: "Skincare market shifts to watch in 2026 (demo)", snippet: "Fictional trend report: minimal routines, refillable packaging and creator-led discovery are growing; luxury heritage brands are losing share with under-25s.", publisher: "Example Trends (demo)", publishedAt: "2026-06-30T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://music.example.org/lofi-and-self-care", externalId: null, title: "Lo-fi playlists and the self-care routine (demo)", snippet: "Fictional culture feature: study and lo-fi music playlists are often paired with evening skincare as a wind-down ritual among college students.", publisher: "Example Culture (demo)", publishedAt: "2026-05-11T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
  { sourceType: "demo_fixture", url: "https://review.example.org/competitor-b-serum", externalId: null, title: "Competitor B serum review: pricey but loved (demo)", snippet: "Fictional review: the competitor's campaign leans on celebrity endorsements; reviewers praise results but complain about price and packaging waste.", publisher: "Example Reviews (demo)", publishedAt: "2026-08-02T00:00:00.000Z", language: "en", metrics: {}, usageRestrictions: "Fictional demonstration content." },
];

/** Word stems (first five letters), so "criticism" matches "critics" and "routines" matches "routine". */
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).map((w) => w.slice(0, 5)));

/** Stable tie-breaker so the same query always returns the same fixtures. */
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

/** The fixtures that best match the query (3 by default), so different questions find different demo sources. */
export function demoSearch(query: string, count = 3): ProviderCall<Hit[]> {
  const q = words(query);
  const data = FIXTURES
    .map((f) => ({ f, score: [...words(`${f.title} ${f.snippet}`)].filter((w) => q.has(w)).length, tie: hash(`${query}|${f.url}`) }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, count)
    .map(({ f }) => ({ ...f, provider: "demo_web" as const }));
  return { ok: true, data, status: "ok", httpStatus: null, durationMs: 0, error: null, errorKind: null, units: 0, costUsdEstimated: 0, costUsdActual: null, params: { q: query, note: "demonstration fixture" }, raw: { demo: true }, cached: false };
}
