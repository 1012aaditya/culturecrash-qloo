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
];

export function demoSearch(query: string): ProviderCall<Hit[]> {
  const data = FIXTURES.map((f) => ({ ...f, provider: "demo_web" as const }));
  return { ok: true, data, status: "ok", httpStatus: null, durationMs: 0, error: null, errorKind: null, units: 0, costUsdEstimated: 0, costUsdActual: null, params: { q: query, note: "demonstration fixture" }, raw: { demo: true }, cached: false };
}
