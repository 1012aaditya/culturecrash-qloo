import { describe, expect, it, vi } from "vitest";
import { describeQlooCall, QLOO_CALL_BUDGET, QlooSession, type QlooLike } from "@/lib/ai/copilot-qloo";
import { QlooError, type NormalizedEntity, type NormalizedTag } from "@/lib/providers/qloo/types";

const ent = (providerId: string, name: string, affinity: number | null = null, explainability: { entityId: string; score: number }[] = []): NormalizedEntity =>
  ({ providerId, name, type: "artist", affinity, popularity: 0.5, tags: [], description: null, disambiguation: null, explainability });
const tag = (providerId: string, name: string): NormalizedTag => ({ providerId, name, type: "urn:tag:keyword", affinity: null, popularity: null });
const ok = <T,>(data: T) => ({ endpoint: "/x", params: {}, status: "ok" as const, httpStatus: 200, durationMs: 1, raw: null, data, error: null, retrievedAt: "t" });

function fake(over: Partial<Record<keyof QlooLike, unknown>> = {}) {
  const seeds: Record<string, NormalizedEntity> = { Glossier: ent("g", "Glossier"), Fenty: ent("f", "Fenty Beauty") };
  return {
    search: vi.fn(async (q: string) => ok(seeds[q] ? [seeds[q]] : [])),
    searchTags: vi.fn(async (q: string) => ok(q === "vinyl" ? [tag("t-vinyl", "Vinyl")] : [])),
    insights: vi.fn(async () => ok([ent("m", "Mitski", 0.9, [{ entityId: "g", score: 0.7 }, { entityId: "t-vinyl", score: 0.9 }])])),
    tagInsights: vi.fn(async () => ok([tag("x", "Self-care")])),
    ...over,
  } as unknown as QlooLike & Record<keyof QlooLike, ReturnType<typeof vi.fn>>;
}

describe("live Qloo tools", () => {
  it("resolves the audience, asks insights with the right signals and says which seed drove each result", async () => {
    const client = fake();
    const s = new QlooSession(client);
    const out = await s.run("qloo_taste", { audience: { likes: ["Glossier", "Nobody"], interests: ["vinyl"] }, find: "artist", location: "Tokyo" });
    expect(client.insights).toHaveBeenCalledWith(expect.objectContaining({
      filterType: "urn:entity:artist", signalEntities: ["g"], signalTags: ["t-vinyl"], excludeEntities: ["g"], signalLocationQuery: "Tokyo", filterLocationQuery: undefined, explainability: true,
    }));
    expect(out.result).toMatchObject({ seedsUsed: "Glossier + Vinyl", notRecognised: ["Nobody"], results: [{ ref: "Q1", name: "Mitski", affinity: 0.9, because: ["Glossier"] }] });
    expect(out.refs).toEqual(["Q1"]);
    expect(s.refs.get("Q1")?.asked).toBe("music artists for fans of Glossier + Vinyl in Tokyo");
  });

  it("limits places to the market instead of shifting taste", async () => {
    const client = fake();
    await new QlooSession(client).run("qloo_taste", { audience: { likes: ["Glossier"] }, find: "place", location: "Mumbai" });
    expect(client.insights).toHaveBeenCalledWith(expect.objectContaining({ filterType: "urn:entity:place", filterLocationQuery: "Mumbai", signalLocationQuery: undefined }));
  });

  it("returns taste themes for find: tag", async () => {
    const client = fake();
    const out = await new QlooSession(client).run("qloo_taste", { audience: { likes: ["Glossier"] }, find: "tag" });
    expect(client.tagInsights).toHaveBeenCalled();
    expect(out.result).toMatchObject({ results: [{ ref: "Q1", name: "Self-care" }] });
  });

  it("compares two audiences into shared and distinctive lists", async () => {
    const insights = vi.fn()
      .mockResolvedValueOnce(ok([ent("1", "Mitski", 0.9), ent("2", "SZA", 0.8)]))
      .mockResolvedValueOnce(ok([ent("2", "SZA", 0.95), ent("3", "Rihanna", 0.9)]));
    const out = await new QlooSession(fake({ insights })).run("qloo_compare", { a: { likes: ["Glossier"] }, b: { likes: ["Fenty"] }, find: "artist" });
    expect(out.result).toMatchObject({
      audienceA: "Glossier", audienceB: "Fenty Beauty",
      shared: [{ name: "SZA", affinityA: 0.8, affinityB: 0.95 }], onlyA: [{ name: "Mitski" }], onlyB: [{ name: "Rihanna" }],
    });
    expect(out.refs).toHaveLength(3);
  });

  it("says plainly when Qloo recognises nothing, and rejects bad input", async () => {
    const s = new QlooSession(fake());
    expect((await s.run("qloo_taste", { audience: { likes: ["Nobody"] }, find: "artist" })).result).toEqual({ error: "Qloo recognised none of: Nobody." });
    expect((await s.run("qloo_taste", { audience: {}, find: "artist" })).result).toMatchObject({ error: "Invalid input" });
    expect((await s.run("qloo_taste", { audience: { likes: ["x"] }, find: "spaceship" })).result).toMatchObject({ error: "Invalid input" });
  });

  it("turns Qloo errors into a tool error instead of failing the answer", async () => {
    const out = await new QlooSession(fake({ insights: vi.fn().mockRejectedValue(new QlooError("Qloo rate limit reached", "rate_limited")) }))
      .run("qloo_taste", { audience: { likes: ["Glossier"] }, find: "artist" });
    expect(out).toEqual({ result: { error: "Qloo rate limit reached" }, refs: [] });
  });

  it("stops after the per-question call budget", async () => {
    const client = fake();
    const s = new QlooSession(client);
    for (let i = 0; i < QLOO_CALL_BUDGET + 3; i++) await s.run("qloo_find", { query: "Glossier" });
    expect(client.search).toHaveBeenCalledTimes(QLOO_CALL_BUDGET);
    expect((await s.run("qloo_find", { query: "Glossier" })).result).toMatchObject({ error: expect.stringContaining("used its live Qloo lookups") });
  });

  it("labels the steps in plain words", () => {
    expect(describeQlooCall("qloo_compare", { a: { likes: ["Glossier"] }, b: { interests: ["k-beauty"] }, find: "tv_show", location: "Seoul" }))
      .toBe("Asked Qloo to compare Glossier fans with k-beauty fans on TV shows in Seoul");
  });
});
