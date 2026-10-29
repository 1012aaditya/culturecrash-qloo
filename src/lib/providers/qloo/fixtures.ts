/**
 * DEMONSTRATION FIXTURES — fictional entities with illustrative values.
 * Used only for explicitly requested demo runs (CC_DEMO_MODE=enabled, never in
 * production). Every record created from them is stored with mode='demo' and
 * is_demo=true and is labelled in the UI, exports and shared reports.
 */
import type { InsightsParams } from "./client";
import type { EntityTypeUrn, NormalizedEntity, NormalizedTag, QlooCall } from "./types";

const E = (id: string, name: string, type: string, affinity: number, popularity: number, tags: string[] = []): NormalizedEntity => ({
  providerId: `demo-${id}`, name, type, affinity, popularity, tags, description: "Fictional demonstration entity.", disambiguation: null, explainability: [],
});

const byType: Record<string, NormalizedEntity[]> = {
  brand: [E("b1", "Lumen Skin Co. (fictional)", "brand", 0.91, 0.62, ["skincare", "minimalism"]), E("b2", "Seoul Dew Lab (fictional)", "brand", 0.88, 0.55, ["k-beauty"]), E("b3", "Petal & Proof (fictional)", "brand", 0.81, 0.4), E("b4", "Gloss Republic (fictional)", "brand", 0.74, 0.7)],
  artist: [E("a1", "Velvet Hours (fictional band)", "artist", 0.86, 0.48, ["indie pop"]), E("a2", "Mira Kael (fictional artist)", "artist", 0.83, 0.52, ["k-pop"]), E("a3", "Neon Monsoon (fictional)", "artist", 0.77, 0.31)],
  tv_show: [E("t1", "Glass Morning (fictional series)", "tv_show", 0.84, 0.44, ["k-drama"]), E("t2", "Studio Ritual (fictional)", "tv_show", 0.72, 0.29)],
  place: [E("p1", "Matcha House Bandra (fictional)", "place", 0.8, 0.22, ["cafe"]), E("p2", "Indiranagar Night Market (fictional)", "place", 0.76, 0.35)],
  podcast: [E("c1", "Slow Self Care (fictional podcast)", "podcast", 0.79, 0.2, ["wellness"])],
  destination: [E("d1", "Jeju Island (demo value)", "destination", 0.73, 0.6), E("d2", "Goa coast (demo value)", "destination", 0.69, 0.66)],
};

const tags: NormalizedTag[] = [
  { providerId: "demo-tag-1", name: "Clean beauty", type: "urn:tag:keyword", affinity: 0.82, popularity: null },
  { providerId: "demo-tag-2", name: "Self-care rituals", type: "urn:tag:keyword", affinity: 0.79, popularity: null },
  { providerId: "demo-tag-3", name: "Minimalism", type: "urn:tag:keyword", affinity: 0.71, popularity: null },
  { providerId: "demo-tag-4", name: "Aesthetic content", type: "urn:tag:keyword", affinity: 0.66, popularity: null },
];

function call<T>(endpoint: string, params: Record<string, string>, data: T[]): QlooCall<T[]> {
  return { endpoint: `${endpoint} (demo fixture)`, params, status: data.length ? "ok" : "empty", httpStatus: null, durationMs: 0, raw: { demo: true, results: { entities: data } }, data, error: null, retrievedAt: new Date().toISOString() };
}

export class DemoQlooClient {
  readonly configured = true;
  async search(query: string, _types: EntityTypeUrn[] = [], _take = 5) {
    void _types;
    void _take;
    const seed: NormalizedEntity = { ...E(`seed-${query.toLowerCase().replace(/\W+/g, "-")}`, query, "brand", 1, 0.5), affinity: null, description: "Demonstration seed resolved from the brief." };
    return call("/search", { query }, [seed]);
  }
  async insights(p: InsightsParams) {
    const type = p.filterType.replace("urn:entity:", "");
    return call("/v2/insights", { "filter.type": p.filterType }, (byType[type] ?? []).map((e) => ({ ...e, explainability: (p.signalEntities ?? []).slice(0, 2).map((id, i) => ({ entityId: id, score: Number(((e.affinity ?? 0.5) - i * 0.1).toFixed(2)) })) })));
  }
  async searchTags(query: string, _take = 3): Promise<QlooCall<NormalizedTag[]>> {
    void _take;
    const slug = query.toLowerCase().replace(/\W+/g, "-");
    return call("/v2/tags", { "filter.query": query }, [{ providerId: `demo-interest-${slug}`, name: query, type: "urn:tag:keyword", affinity: null, popularity: null }]);
  }
  async tagInsights(_p: Omit<InsightsParams, "filterType">) {
    void _p;
    return call("/v2/insights", { "filter.type": "urn:tag" }, tags);
  }
}
