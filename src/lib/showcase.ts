/**
 * Static DEMONSTRATION content for the public showcase. Fictional entities and
 * illustrative values only; rendered with prominent demonstration labels.
 */
import type { EntityRow, RelRow } from "@/lib/data/research";
import type { ReportSnapshot } from "@/lib/reports/types";

const at = "2026-10-01T10:00:00.000Z";
const e = (id: string, name: string, type: string, role: EntityRow["role"], affinity: number | null): EntityRow => ({
  id, providerId: `demo-${id}`, name, type, role, affinity, popularity: null, tags: [], description: "Fictional demonstration entity.", retrievedAt: at, sourceId: null, evidenceId: null, imageUrl: null, profileOf: null,
});

export const showcaseEntities: EntityRow[] = [
  e("s1", "Lumen (sample brand)", "brand", "seed", null),
  e("s2", "Competitor A (sample)", "brand", "seed", null),
  e("b1", "Seoul Dew Lab (fictional)", "brand", "result", 0.88),
  e("b2", "Petal & Proof (fictional)", "brand", "result", 0.81),
  e("b3", "Gloss Republic (fictional)", "brand", "result", 0.74),
  e("a1", "Velvet Hours (fictional band)", "artist", "result", 0.86),
  e("a2", "Mira Kael (fictional artist)", "artist", "result", 0.83),
  e("a3", "Neon Monsoon (fictional)", "artist", "result", 0.77),
  e("t1", "Glass Morning (fictional series)", "tv_show", "result", 0.84),
  e("t2", "Studio Ritual (fictional)", "tv_show", "result", 0.72),
  e("p1", "Matcha House (fictional cafe)", "place", "result", 0.8),
  e("p2", "Night Market (fictional)", "place", "result", 0.76),
  e("c1", "Slow Self Care (fictional podcast)", "podcast", "result", 0.79),
  e("g1", "Clean beauty", "tag", "tag", 0.82),
  e("g2", "Self-care rituals", "tag", "tag", 0.79),
  e("g3", "Minimalism", "tag", "tag", 0.71),
  e("g4", "Aesthetic content", "tag", "tag", 0.66),
];

export const showcaseRelationships: RelRow[] = [
  { id: "r1", from: "s1", to: "a1", relation: "explainability", value: 0.61 },
  { id: "r2", from: "s2", to: "b1", relation: "explainability", value: 0.55 },
  { id: "r3", from: "s1", to: "t1", relation: "explainability", value: 0.58 },
];

export const showcaseReport: ReportSnapshot = {
  title: "Skincare Launch — sample report",
  projectName: "Skincare Launch (sample)",
  clientName: "Sample client",
  generatedAt: at,
  containsDemoData: true,
  sections: ["cover", "executive", "methodology", "landscape", "opportunities", "directions", "experiments", "limitations"],
  available: [],
  executiveSummary: {
    research: "In this demonstration, the sample brand signal returned twelve fictional entities across five types. Values are illustrative and do not come from Qloo.",
    selectedDirection: "Cultural adjacency — Music: place the brand inside the indie and K-pop culture its audience already gravitates to.",
    opportunities: ["Music adjacency: Velvet Hours (fictional)", "Taste territory: Clean beauty × Self-care rituals"],
    experiments: ["Routine-led messaging vs current positioning (planned)"],
  },
  brief: { brand: "Lumen (sample)", product: "Premium skincare line", category: "Skincare", market: "India", audience: "Gen Z in metro cities", objective: "Launch and build consideration", existingPositioning: null, competitors: ["Competitor A (sample)"], timeframe: null, budgetRange: null, revision: 1 },
  methodology: { question: "Which cultural entities co-occur with people connected to the sample brand in India?", mode: "demo", provider: "demonstration fixtures", runAt: at, briefRevision: 1, signals: ["Lumen (sample)", "Competitor A (sample)"], location: "India", requests: 7, failedRequests: 0, interpretationBy: "Demonstration fixture", notes: ["All values in this showcase are fictional."] },
  landscape: [
    { type: "artist", items: [{ name: "Velvet Hours (fictional band)", affinity: 0.86 }, { name: "Mira Kael (fictional artist)", affinity: 0.83 }, { name: "Neon Monsoon (fictional)", affinity: 0.77 }] },
    { type: "brand", items: [{ name: "Seoul Dew Lab (fictional)", affinity: 0.88 }, { name: "Petal & Proof (fictional)", affinity: 0.81 }] },
    { type: "taste tags", items: [{ name: "Clean beauty", affinity: 0.82 }, { name: "Self-care rituals", affinity: 0.79 }] },
  ],
  findings: [{ statement: "Music entities returned the highest affinities after brands in this sample.", kind: "observation" }],
  evidence: [],
  opportunities: [
    { title: "Music adjacency: Velvet Hours", description: "Fictional indie acts returned with relatively high affinity for the sample signal.", whyItMatters: null, unknowns: "Whether the audience welcomes the brand in music culture.", validation: "Concept test music-led creative against category-led creative.", status: "saved", generatedBy: "Demonstration fixture", evidenceIds: [] },
    { title: "Taste territory: Clean beauty × Self-care rituals", description: "Two sample tags that may describe a sensibility rather than a single interest.", whyItMatters: null, unknowns: "Tags may reflect catalogue metadata.", validation: "Qualitative mood-board reads.", status: "new", generatedBy: "Demonstration fixture", evidenceIds: [] },
  ],
  directions: [],
  strategyGeneratedBy: "Demonstration fixture",
  selected: null,
  creativeBrief: null,
  experiments: [{ name: "Routine-led messaging vs current positioning", hypothesis: "Messaging centred on daily self-care routines will generate greater audience interest than the current positioning.", method: "Randomised A/B test (paid social)", primaryMetric: "Click-through rate (%)", threshold: "Adopt if CTR uplift ≥ 15% at 95% confidence", status: "planned", interpretation: null, nextAction: null, results: [] }],
  limitations: ["Everything on this page is demonstration data with fictional entities and illustrative values.", "Affinity describes taste correlation, not purchase intent or causation."],
  openQuestions: [],
  sources: [],
  refs: { runId: null, strategyVersionId: null },
};
