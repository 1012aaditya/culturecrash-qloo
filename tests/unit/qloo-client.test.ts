import { describe, expect, it, vi } from "vitest";
import { QlooClient } from "@/lib/providers/qloo/client";
import { QlooError } from "@/lib/providers/qloo/types";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const noSleep = async () => {};

describe("QlooClient", () => {
  it("sends the key only in the X-Api-Key header and builds insights parameters", async () => {
    const fetcher = vi.fn(async () => json(200, { results: { entities: [{ entity_id: "e1", name: "A", subtype: "urn:entity:brand", query: { affinity: 0.7 } }] } }));
    const c = new QlooClient("secret-key", "https://hackathon.api.qloo.com", fetcher, noSleep);
    const call = await c.insights({ filterType: "urn:entity:brand", signalEntities: ["s1", "s2"], signalLocationQuery: "India", take: 5, explainability: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.pathname).toBe("/v2/insights");
    expect(u.searchParams.get("filter.type")).toBe("urn:entity:brand");
    expect(u.searchParams.get("signal.interests.entities")).toBe("s1,s2");
    expect(u.searchParams.get("signal.location.query")).toBe("India");
    expect(u.searchParams.get("feature.explainability")).toBe("true");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-key");
    expect(call.status).toBe("ok");
    expect(call.data[0]).toMatchObject({ providerId: "e1", affinity: 0.7 });
    expect(JSON.stringify(call.params)).not.toContain("secret-key");
  });

  it("retries 429 with bounded attempts, then succeeds", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(429, { error: "slow down" }, { "retry-after": "1" }))
      .mockResolvedValueOnce(json(200, { results: { entities: [] } }));
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    const call = await c.insights({ filterType: "urn:entity:artist", signalEntities: ["s"] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(call.status).toBe("empty");
  });

  it("gives up after three attempts on persistent 5xx", async () => {
    const fetcher = vi.fn(async () => json(503, {}));
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    await expect(c.insights({ filterType: "urn:entity:artist", signalEntities: ["s"] })).rejects.toBeInstanceOf(QlooError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries a timeout once, not three times", async () => {
    const fetcher = vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); });
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    await expect(c.insights({ filterType: "urn:entity:place", signalEntities: ["s"] })).rejects.toMatchObject({ code: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry 4xx client errors and surfaces the provider message", async () => {
    const fetcher = vi.fn(async () => json(400, { error: "filter.type is required" }));
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    await expect(c.insights({ filterType: "urn:entity:brand" })).rejects.toThrow(/filter.type is required/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats search 404 as no results", async () => {
    const c = new QlooClient("k-12345678", "https://api.qloo.com", vi.fn(async () => json(404, { error: "not found" })), noSleep);
    const call = await c.search("unknown brand");
    expect(call.status).toBe("empty");
    expect(call.data).toEqual([]);
  });

  it("rejects unexpected response shapes instead of guessing", async () => {
    const c = new QlooClient("k-12345678", "https://api.qloo.com", vi.fn(async () => json(200, { data: [] })), noSleep);
    await expect(c.insights({ filterType: "urn:entity:brand", signalEntities: ["s"] })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("refuses to call without a key, and refuses non-Qloo origins", async () => {
    const fetcher = vi.fn();
    await expect(new QlooClient(undefined, "https://api.qloo.com", fetcher, noSleep).search("x")).rejects.toMatchObject({ code: "missing_key" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => new QlooClient("k", "https://evil.example.com")).toThrow(/Unsupported/);
  });

  it("maps network failures to a typed error after retries", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    await expect(c.search("x")).rejects.toMatchObject({ code: "network" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("QlooClient — hackathon guide error cases", () => {
  it("maps 401 to an actionable base-URL/key error without retrying", async () => {
    const fetcher = vi.fn(async () => json(401, { error: "No API key found in request" }));
    const c = new QlooClient("k-12345678", "https://api.qloo.com", fetcher, noSleep);
    await expect(c.insights({ filterType: "urn:entity:movie", signalEntities: ["s"] })).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("maps 403 to an entity-type permission error", async () => {
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", vi.fn(async () => json(403, { error: "You do not have permission to access urn:entity:video_game" })), noSleep);
    await expect(c.insights({ filterType: "urn:entity:video_game", signalEntities: ["s"] })).rejects.toMatchObject({ code: "forbidden_type", httpStatus: 403 });
  });
  it("uses the documented video_game URN", async () => {
    const { ENTITY_TYPES } = await import("@/lib/providers/qloo/types");
    expect(ENTITY_TYPES).toContain("urn:entity:video_game");
    expect(ENTITY_TYPES).not.toContain("urn:entity:videogame" as never);
  });
});

describe("QlooClient — shapes observed from the live hackathon API", () => {
  // Same structure as a real /search response (values invented; Qloo data is not committed).
  const searchShape = { results: [{ name: "Example Beauty", entity_id: "11111111-2222-3333-4444-555555555555", types: ["urn:entity:brand"], popularity: 0.98, disambiguation: "",
    properties: { short_description: "A beauty retailer.", akas: [{ language: "fr", value: "Exemple" }], image: { url: "https://images.example/x.jpg" } },
    tags: [{ name: "Skincare", tag_id: "urn:tag:keyword:qloo:skincare", type: "urn:tag:keyword:qloo" }] }] };

  it("normalises a live-shaped /search response (results array, types[] instead of type)", async () => {
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", vi.fn(async () => json(200, searchShape)), noSleep);
    const call = await c.search("Example", ["urn:entity:brand"], 2);
    expect(call.status).toBe("ok");
    expect(call.data[0]).toMatchObject({ providerId: "11111111-2222-3333-4444-555555555555", name: "Example Beauty", type: "brand", popularity: 0.98, affinity: null, description: "A beauty retailer.", tags: ["Skincare"] });
  });

  it("surfaces the documented {errors:[{message,path}]} error shape", async () => {
    const body = { errors: [{ message: "the signal.interests.entities parameter contains invalid entity ids", path: "signal.interests.entities" }] };
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", vi.fn(async () => json(400, body)), noSleep);
    await expect(c.insights({ filterType: "urn:entity:artist", signalEntities: ["bad"] })).rejects.toThrow(/contains invalid entity ids \(signal.interests.entities\)/);
  });
});

describe("QlooClient — live /v2/insights shapes", () => {
  it("prefers subtype over the generic type 'urn:entity' on insights entities", async () => {
    const body = { success: true, results: { entities: [{ name: "Example Artist", entity_id: "A-1", type: "urn:entity", subtype: "urn:entity:artist", properties: {}, query: { affinity: 0.91 } }] } };
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", vi.fn(async () => json(200, body)), noSleep);
    const call = await c.insights({ filterType: "urn:entity:artist", signalEntities: ["s"] });
    expect(call.data[0]).toMatchObject({ type: "artist", affinity: 0.91 });
  });
  it("parses tag insights and sends filter.tag.types", async () => {
    const body = { success: true, results: { tags: [{ tag_id: "urn:tag:lifestyle:qloo:self_care_routine", name: "Self-Care Routine", subtype: "urn:tag:lifestyle:qloo", popularity: 0.9, query: { affinity: 0.97 } }] } };
    const fetcher = vi.fn(async () => json(200, body));
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", fetcher, noSleep);
    const call = await c.tagInsights({ signalEntities: ["s"], signalLocationQuery: "India", filterTagTypes: ["urn:tag:lifestyle:qloo"] });
    expect(new URL((fetcher.mock.calls[0] as unknown as [string])[0]).searchParams.get("filter.tag.types")).toBe("urn:tag:lifestyle:qloo");
    expect(call.data[0]).toMatchObject({ name: "Self-Care Routine", type: "urn:tag:lifestyle:qloo", affinity: 0.97 });
  });

  it("resolves interests through /v2/tags and sends them as signal.interests.tags", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, results: { tags: [{ id: "urn:tag:keyword:qloo:skincare", name: "Skincare", type: "urn:tag:keyword:qloo" }] } }))
      .mockResolvedValueOnce(json(200, { results: { entities: [] } }));
    const c = new QlooClient("k-12345678", "https://hackathon.api.qloo.com", fetcher, noSleep);
    const tags = await c.searchTags("skincare");
    const u1 = new URL((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(u1.pathname).toBe("/v2/tags");
    expect(u1.searchParams.get("filter.query")).toBe("skincare");
    expect(tags.data[0]).toMatchObject({ providerId: "urn:tag:keyword:qloo:skincare", name: "Skincare" });
    await c.insights({ filterType: "urn:entity:brand", signalTags: [tags.data[0].providerId] });
    const u2 = new URL((fetcher.mock.calls[1] as unknown as [string])[0]);
    expect(u2.searchParams.get("signal.interests.tags")).toBe("urn:tag:keyword:qloo:skincare");
    expect(u2.searchParams.has("signal.interests.entities")).toBe(false);
  });
});
