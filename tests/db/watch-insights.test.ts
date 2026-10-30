/**
 * Watch insights end to end: the 30-day history backfill (week-by-week date-range searches), AI labelling
 * (relevance, topic, importance — with Claude faked) and the dashboard built on top, through the real
 * daily job against a fresh database. Requires TEST_DATABASE_ADMIN_URL (a Postgres superuser URL).
 */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ current: null as null | { user: { id: string }; workspace: { workspaceId: string; role: string } } }));
vi.mock("@/lib/data/workspace", () => ({ getCtx: async () => ctx.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

// Fake Claude: a story mentioning "fan art" isn't about the brand; topic and importance follow simple cues.
const ai = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai")>()),
  generateStructured: async ({ prompt }: { prompt: string }) => {
    ai.calls++;
    const items = [...prompt.matchAll(/^\[(\d+)\] .*title: (.*?)(?: \| excerpt:.*)?$/gm)];
    return {
      data: { stories: items.map(([, i, title]) => ({
        i: Number(i), about_company: !/fan art/i.test(title),
        topic: /results|quarter/i.test(title) ? "financial" : /collab|partner/i.test(title) ? "collaboration" : "launch",
        importance: /results|quarter/i.test(title) ? 5 : /collab|partner/i.test(title) ? 4 : 2,
      })) },
      generator: "llm:test", usage: { tokensIn: 3000, tokensOut: 800, model: "claude-haiku-5-5" },
    };
  },
}));

const admin = process.env.TEST_DATABASE_ADMIN_URL;
const d = admin ? describe : describe.skip;
const DB = `cc_watch_insights_${Date.now()}`;
let sql: postgres.Sql;
let root: postgres.Sql;

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${uid}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  })) as T;
}

// Fake news: each date-range search returns stories dated inside its range.
const searches: { provider: string; range: string | null }[] = [];
const fakeBodies: { num?: number; tbs?: string }[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url.startsWith("https://google.serper.dev/news")) {
    fakeBodies.push(body);
    const name = /"([^"]+)"/.exec(body.q)![1];
    const m = /cd_min:(\d+)\/(\d+)\/(\d+),cd_max:(\d+)\/(\d+)\/(\d+)/.exec(body.tbs ?? "");
    searches.push({ provider: "serper", range: m ? body.tbs : null });
    if (!m) return Response.json({ news: [] });
    if (body.q.includes(" OR ")) return Response.json({ news: [] }); // the topics search adds nothing here
    const k = `${m[1]}-${m[2]}`;
    return Response.json({ news: [
      { title: `${name} reports quarterly results, day ${k}`, link: `https://wire.test/${name}/results-${k}`, snippet: `${name} results.`, source: "Wire", date: "2 weeks ago" },
      { title: `${name} announces collab with a designer, day ${k}`, link: `https://style.test/${name}/collab-${k}`, snippet: `${name} collab.`, source: "Style", date: "2 weeks ago" },
      { title: `Best ${name} fan art of the day ${k}`, link: `https://fans.test/${name}/art-${k}`, snippet: `${name} fan art.`, source: "Fans", date: "2 weeks ago" },
    ] });
  }
  if (url.startsWith("https://api.exa.ai")) {
    searches.push({ provider: "exa", range: body.endPublishedDate ?? null });
    return Response.json({ results: [] });
  }
  throw new Error(`unexpected fetch ${url}`);
});

let U: { id: string; ws: string };
let watchId: string, clientId: string;

d("Watch insights: history, AI labels and the dashboard", () => {
  beforeAll(async () => {
    root = postgres(admin!, { max: 1, onnotice: () => {} });
    await root.unsafe(`create database ${DB}`);
    const url = new URL(admin!);
    url.pathname = `/${DB}`;
    sql = postgres(url.toString(), { max: 4, onnotice: () => {}, prepare: false });
    await sql.unsafe(readFileSync("db/local/000_supabase_shim.sql", "utf8"));
    for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      const text = readFileSync(`supabase/migrations/${f}`, "utf8");
      if (/storage\.(buckets|objects)/.test(text)) continue;
      await sql.unsafe(text);
    }
    Object.assign(process.env, { DATABASE_URL: url.toString(), CRON_SECRET: "test-cron-secret-0123456789", SERPER_API_KEY: "serper-test-key", EXA_API_KEY: "exa-test-key",
      ANTHROPIC_API_KEY: "anthropic-test-key", AUTH_MODE: "local", WATCH_BACKFILL_DAYS: "30" });
    delete process.env.YOUTUBE_API_KEY;
    globalThis.__ccSql = undefined;
    vi.stubGlobal("fetch", fakeFetch);
    const [u] = await sql`insert into auth.users (email, raw_user_meta_data) values ('owner@o.test', ${sql.json({ full_name: "Owner" })}) returning id`;
    const [m] = await sql`select workspace_id from workspace_members where user_id = ${u.id}`;
    U = { id: u.id, ws: m.workspace_id };
    ctx.current = { user: { id: U.id }, workspace: { workspaceId: U.ws, role: "owner" } };
    clientId = (await as(U.id, (tx) => tx`insert into clients (workspace_id, name, industry, created_by) values (${U.ws}, 'Nike', 'Sportswear', ${U.id}) returning id`))[0].id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await globalThis.__ccSql?.end();
    globalThis.__ccSql = undefined;
    await sql?.end();
    await root?.unsafe(`drop database if exists ${DB} with (force)`);
    await root?.end();
  });

  it("a new watch loads 30 days of history right away, day by day, without moving the daily schedule", async () => {
    const { saveWatchAction } = await import("@/lib/watch/actions");
    expect(await saveWatchAction(clientId, { company: "Nike", competitors: ["Adidas"], keywords: [], frequency: "daily" })).toMatchObject({ ok: true, message: /last 30 days/ });
    watchId = (await sql`select id from watches where client_id = ${clientId}`)[0].id;
    await vi.waitFor(async () => {
      const jobs = await sql`select status from watch_jobs where watch_id = ${watchId} and run_key like 'backfill:d%'`;
      expect(jobs.map((j) => j.status)).toEqual(Array(6).fill("completed"));
    }, { timeout: 120_000, interval: 500 });
    // Parallel chunks finishing together used to deadlock while relabelling the same stories.
    expect(await sql`select 1 from watch_jobs where watch_id = ${watchId} and error_message is not null`).toHaveLength(0);
    const ranged = searches.filter((s) => s.range);
    // 30 days × 2 companies × (2 Serper + 1 Exa); 3 results per page, so no second pages.
    expect(ranged).toHaveLength(30 * 2 * 3);
    expect(fakeBodies.every((b) => !b.num || b.num <= 10)).toBe(true); // Serper's free plan refuses more than 10
    expect(fakeBodies.every((b) => /cd_min:(\d+\/\d+\/\d+),cd_max:\1$/.test(b.tbs ?? ""))).toBe(true); // one day per search
    const [w] = await sql`select next_run_at, last_attempted_at, last_success_at from watches where id = ${watchId}`;
    expect(w.last_attempted_at).toBeNull(); // history isn't a check: the first daily check is still due
    expect(w.last_success_at).toBeNull();
    const span = await sql`select count(distinct published_at::date)::int as days, min(published_at) as first from research_documents where watch_id = ${watchId}`;
    expect(span[0].days).toBeGreaterThanOrEqual(25); // stories on (almost) every day, not bunched by week
    expect(Date.now() - span[0].first.getTime()).toBeGreaterThan(25 * 86_400_000);
  }, 180_000);

  it("AI labels every story, hides the ones not about the brand, and its cost is in the ledger", async () => {
    const docs = await sql`select title, watch_relevance, watch_relevance_reason, watch_topic, watch_importance from research_documents where watch_id = ${watchId}`;
    expect(docs.every((x) => x.watch_topic)).toBe(true);
    const art = docs.filter((x) => /fan art/.test(x.title));
    expect(art.length).toBeGreaterThan(0);
    expect(art.every((x) => x.watch_relevance === "off_topic" && /checked by AI/.test(x.watch_relevance_reason))).toBe(true);
    expect(docs.find((x) => /results/.test(x.title))).toMatchObject({ watch_topic: "financial", watch_importance: 5, watch_relevance: "relevant" });
    const llm = await sql`select status, cost_usd_estimated, tokens_in from research_sources where provider = 'anthropic' and endpoint = 'messages:watch-classify'`;
    expect(llm.length).toBeGreaterThan(0);
    expect(llm.every((r) => r.status === "ok" && Number(r.cost_usd_estimated) > 0 && r.tokens_in === 3000)).toBe(true);
  });

  it("builds the dashboard: 30-day trend, share of voice, topics and ranked key developments", async () => {
    const { getWatchView } = await import("@/lib/watch/data");
    const view = await getWatchView({ user: { id: U.id }, workspace: { workspaceId: U.ws } } as never, clientId);
    const dash = view!.dashboard!;
    expect(view!.history).toMatchObject({ status: "completed" });
    expect(dash.days).toHaveLength(30);
    expect(dash.historyDays).toBeGreaterThan(20);
    const nike = dash.companies.find((c) => c.name === "Nike")!;
    expect(dash.daily[nike.targetId].filter((x) => x > 0).length).toBeGreaterThanOrEqual(4); // coverage spread over the month
    expect(dash.companies.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 5);
    expect(nike.topics).toMatchObject({ financial: expect.any(Number), collaboration: expect.any(Number) });
    expect(Object.keys(nike.topics)).not.toContain("other");
    const imp = dash.keyEvents.map((e) => e.importance);
    expect(imp).toEqual([...imp].sort((a, b) => b - a));
    expect(dash.keyEvents.some((e) => /fan art/.test(e.title))).toBe(false);
    expect(view!.hidden.filter((h) => h.kind === "off_topic").length).toBeGreaterThan(0);
  });

  it("loads history only once, and labels only new stories on later runs", async () => {
    const { loadHistoryAction } = await import("@/lib/watch/actions");
    expect(await loadHistoryAction(clientId)).toMatchObject({ ok: false, error: /already/ });
    const before = ai.calls;
    searches.length = 0;
    const { runWatchCron } = await import("@/lib/watch/schedule");
    await runWatchCron({ dispatch: async () => ({}) });
    expect(searches.filter((s) => s.range)).toHaveLength(0); // the daily run doesn't redo history
    expect(await sql`select 1 from watch_jobs where watch_id = ${watchId} and run_key like 'backfill:%'`).toHaveLength(6);
    expect(ai.calls).toBe(before); // nothing new to label (the daily searches returned no stories)
  });
});
