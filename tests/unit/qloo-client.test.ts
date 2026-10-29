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
