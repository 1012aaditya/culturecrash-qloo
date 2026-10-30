/**
 * Watch Milestone 2 (persistent monitoring) tests: sightings history and daily counts, a second results
 * page, retries of failed searches and failed runs, the three-failures-in-a-row warning, handover when the
 * creator leaves, and extra parallel workers. Drives the real cron route against a fresh database; only
 * the news providers are fake. Requires TEST_DATABASE_ADMIN_URL (a Postgres superuser URL).
 */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const admin = process.env.TEST_DATABASE_ADMIN_URL;
const d = admin ? describe : describe.skip;
const DB = `cc_watch2_${Date.now()}`;
const SECRET = "test-cron-secret-0123456789";
let sql: postgres.Sql;
let root: postgres.Sql;

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${uid}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  })) as T;
}
async function user(email: string) {
  const [u] = await sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: email.split("@")[0] })}) returning id`;
  const [m] = await sql`select workspace_id from workspace_members where user_id = ${u.id}`;
  return { id: u.id as string, ws: m.workspace_id as string };
}
/** A watch on a new client, set up as `uid`, due now. */
async function watchFor(uid: string, ws: string, company: string, competitors: string[] = []) {
  const [c] = await as(uid, (tx) => tx`insert into clients (workspace_id, name, created_by) values (${ws}, ${company}, ${uid}) returning id`);
  const [w] = await as(uid, (tx) => tx`insert into watches (workspace_id, client_id, created_by) values (${ws}, ${c.id}, ${uid}) returning id`);
  for (const [i, name] of [company, ...competitors].entries()) {
    await as(uid, (tx) => tx`insert into watch_targets (watch_id, workspace_id, role, name) values (${w.id}, ${ws}, ${i === 0 ? "company" : "competitor"}, ${name})`);
  }
  return { watchId: w.id as string, clientId: c.id as string };
}

// ---- Fake providers -------------------------------------------------------------------------------
const ctl = { fullNikePage: false, alwaysFail: false, failFirstSearchOf: null as null | "exa" | "all", failSearches: 1 };
const fetchesFor = new Map<string, number>();
const calls: { provider: string; q: string; page?: number }[] = [];
const news = (name: string, n: number, from = 0) => Array.from({ length: n }, (_, i) => ({
  title: `${name} story number ${from + i + 1} about its latest plans`, link: `https://news.test/${name.toLowerCase()}/${from + i + 1}`,
  snippet: `${name} announced something new (${from + i + 1}).`, source: `Outlet ${(from + i) % 4}`, date: `${i + 1} hours ago`,
}));
/**
 * The response for a request, or null to answer normally. `failSearches` searches per key fail with a 500
 * (each search is three requests: the HTTP helper's own retries). `alwaysFail` answers 400, which the
 * helper doesn't retry with back-off, so multi-day failure tests stay fast.
 */
function failure(key: string): Response | null {
  if (ctl.alwaysFail) return new Response("bad request", { status: 400 });
  const n = (fetchesFor.get(key) ?? 0) + 1;
  fetchesFor.set(key, n);
  const hit = ctl.failFirstSearchOf !== null && n <= 3 * ctl.failSearches && (ctl.failFirstSearchOf === "all" || key.startsWith(ctl.failFirstSearchOf));
  return hit ? new Response("down", { status: 500 }) : null;
}
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url.startsWith("https://google.serper.dev/news")) {
    calls.push({ provider: "serper", q: body.q, page: body.page });
    const failed = failure(`serper:${body.q}:${body.page ?? 1}`);
    if (failed) return failed;
    const name = /"([^"]+)"/.exec(body.q)![1];
    if (ctl.fullNikePage && name === "Nike" && !body.q.includes(" OR ")) return Response.json({ news: body.page === 2 ? news(name, 3, 10) : news(name, 10) });
    return Response.json({ news: news(name, 2) });
  }
  if (url.startsWith("https://api.exa.ai")) {
    calls.push({ provider: "exa", q: body.query });
    const failedExa = failure(`exa:${body.query}`);
    if (failedExa) return failedExa;
    const name = String(body.query).split(" ")[0];
    return Response.json({ results: [{ title: `${name} expands its sustainability programme worldwide`, url: `https://exa.test/${name.toLowerCase()}`, publishedDate: "2026-10-29T10:00:00.000Z", highlights: [`${name} said so.`] }] });
  }
  throw new Error(`unexpected fetch ${url}`);
});

const route = async (job: string) => {
  const { GET } = await import("@/app/api/cron/[job]/route");
  const res = await GET(new Request(`http://localhost/api/cron/${job}`, { headers: { authorization: `Bearer ${SECRET}` } }), { params: Promise.resolve({ job }) } as never);
  return (await res.json()).result;
};
/** Runs the daily job as if it were `day` (a date string), with the cache cleared and the watch due. */
async function runDay(day: string, watchIds: string[]) {
  await sql`delete from provider_cache`;
  await sql`update watches set next_run_at = now() where id = any(${watchIds})`;
  const { runWatchCron } = await import("@/lib/watch/schedule");
  return runWatchCron({ now: new Date(`${day}T06:05:00Z`), dispatch: () => route("watch-worker") });
}

let O: { id: string; ws: string }, M: { id: string; ws: string };

d("Watch Milestone 2: persistent monitoring", () => {
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
    Object.assign(process.env, { DATABASE_URL: url.toString(), CRON_SECRET: SECRET, SERPER_API_KEY: "serper-test-key", EXA_API_KEY: "exa-test-key", AUTH_MODE: "local" });
    globalThis.__ccSql = undefined;
    vi.stubGlobal("fetch", fakeFetch);
    O = await user("olivia@o.test");
    M = await user("max@o.test");
    // Max joins Olivia's workspace as a member; Olivia's workspace may hold several watches.
    await as(O.id, (tx) => tx`select invite_member(${O.ws}, 'max@o.test', 'member')`);
    const [inv] = await as(M.id, (tx) => tx`select id from my_pending_invitations()`);
    await as(M.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`);
    await sql`update workspaces set plan = 'agency' where id = ${O.ws}`;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await globalThis.__ccSql?.end();
    globalThis.__ccSql = undefined;
    await sql?.end();
    await root?.unsafe(`drop database if exists ${DB} with (force)`);
    await root?.end();
  });
  beforeEach(() => { calls.length = 0; fetchesFor.clear(); Object.assign(ctl, { fullNikePage: false, alwaysFail: false, failFirstSearchOf: null, failSearches: 1 }); });

  it("keeps every sighting, so a story found again tomorrow is recorded without being stored twice", async () => {
    const { watchId } = await watchFor(O.id, O.ws, "Nike", ["Adidas"]);
    await runDay("2026-11-01", [watchId]);
    const docs1 = (await sql`select count(*)::int as n from research_documents where watch_id = ${watchId}`)[0].n;
    const obs1 = await sql`select o.rank, o.task_key, o.provider from watch_observations o join watch_jobs j on j.id = o.watch_job_id where o.watch_id = ${watchId} and j.run_key = 'schedule:2026-11-01'`;
    expect(docs1).toBeGreaterThan(0);
    expect(obs1.length).toBeGreaterThanOrEqual(docs1);
    expect(obs1.find((o) => o.task_key.endsWith(":serper:name"))?.rank).toBe(1);

    await runDay("2026-11-02", [watchId]);
    const docs2 = (await sql`select count(*)::int as n from research_documents where watch_id = ${watchId}`)[0].n;
    const obs2 = await sql`select count(*)::int as n from watch_observations o join watch_jobs j on j.id = o.watch_job_id where o.watch_id = ${watchId} and j.run_key = 'schedule:2026-11-02'`;
    expect(docs2).toBe(docs1); // nothing stored twice…
    expect(obs2[0].n).toBe(obs1.length); // …but every story was seen again
    // Daily counts: both runs happened today (real clock), so today shows every story seen, each new once.
    const counts = await as(O.id, (tx) => tx`select t.name, c.stories_seen, c.new_stories, c.publishers from watch_daily_counts c
      join watch_targets t on t.id = c.watch_target_id where c.watch_id = ${watchId} order by t.name`);
    expect(counts.map((c) => c.name)).toEqual(["Adidas", "Nike"]);
    for (const c of counts) {
      expect(c.stories_seen).toBeGreaterThan(0);
      expect(c.new_stories).toBe(c.stories_seen);
      expect(c.publishers).toBeGreaterThan(0);
    }
    // Other workspaces can't read the sightings or the counts.
    const other = await user("eve@e.test");
    expect(await as(other.id, (tx) => tx`select * from watch_observations where watch_id = ${watchId}`)).toHaveLength(0);
    expect(await as(other.id, (tx) => tx`select * from watch_daily_counts where watch_id = ${watchId}`)).toHaveLength(0);
  });

  it("fetches a second page of results only when the first is full", async () => {
    ctl.fullNikePage = true;
    const { watchId } = await watchFor(O.id, O.ws, "Nike Inc", []);
    await sql`update watch_targets set name = 'Nike' where watch_id = ${watchId}`;
    await runDay("2026-11-03", [watchId]);
    const nameCalls = calls.filter((c) => c.provider === "serper" && c.q === '"Nike"');
    expect(nameCalls.map((c) => c.page ?? 1)).toEqual([1, 2]); // full first page → page 2
    expect(calls.filter((c) => c.q.includes(" OR ")).map((c) => c.page ?? 1)).toEqual([1]); // 2 results → no page 2
    const urls = await sql`select canonical_url from research_documents where watch_id = ${watchId} and canonical_url like 'https://news.test/nike/%'`;
    expect(urls).toHaveLength(13);
  });

  it("retries a failed search once at the end of the run", async () => {
    ctl.failFirstSearchOf = "exa";
    const { watchId } = await watchFor(O.id, O.ws, "Puma");
    await runDay("2026-11-04", [watchId]);
    const [job] = await sql`select * from watch_jobs where watch_id = ${watchId}`;
    expect(job).toMatchObject({ status: "completed", attempts: 1 });
    const exa = await sql`select status from research_sources where watch_job_id = ${job.id} and provider = 'exa' order by retrieved_at`;
    expect(exa.map((r) => r.status)).toEqual(["error", "ok"]);
    expect(await sql`select 1 from research_documents where watch_id = ${watchId} and provider = 'exa'`).toHaveLength(1);
  });

  it("gives a run that failed outright one more attempt the same day, without counting it as a failure", async () => {
    // Every search fails twice: on the first attempt and on its in-run retry, so the whole run fails.
    Object.assign(ctl, { failFirstSearchOf: "all", failSearches: 2 });
    const { watchId } = await watchFor(O.id, O.ws, "Asics");
    const r = await runDay("2026-11-05", [watchId]);
    expect(r.retried).toBe(1);
    const [job] = await sql`select * from watch_jobs where watch_id = ${watchId}`;
    expect(job).toMatchObject({ status: "completed", attempts: 2 });
    expect((await sql`select consecutive_failures from watches where id = ${watchId}`)[0].consecutive_failures).toBe(0);
  }, 60_000);

  it("tells the owner once when a watch has failed three days in a row, and recovers", async () => {
    const { watchId, clientId } = await watchFor(O.id, O.ws, "Fila");
    const failing = async () => (await sql`select consecutive_failures as n from watches where id = ${watchId}`)[0].n;
    const notes = () => sql`select * from notifications where user_id = ${O.id} and kind = 'watch_failing'`;
    ctl.alwaysFail = true;
    for (const [i, day] of ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].entries()) {
      await runDay(day, [watchId]);
      expect(await failing()).toBe(i + 1);
    }
    const sent = await notes();
    expect(sent).toHaveLength(1); // on the third day only
    expect(sent[0]).toMatchObject({ workspace_id: O.ws, href: `/workspace/clients/${clientId}/watch` });
    expect(sent[0].title).toMatch(/Fila has failed 3 times in a row/);
    const { getWatchView } = await import("@/lib/watch/data");
    const view = await getWatchView({ user: { id: O.id }, workspace: { workspaceId: O.ws } } as never, clientId);
    expect(view!.watch!.consecutiveFailures).toBe(4);
    expect(view!.runs.slice(0, 4).every((r) => r.status === "failed" && r.failedCalls > 0)).toBe(true);

    ctl.alwaysFail = false;
    await runDay("2026-11-10", [watchId]);
    expect(await failing()).toBe(0);
    expect((await getWatchView({ user: { id: O.id }, workspace: { workspaceId: O.ws } } as never, clientId))!.runs[0]).toMatchObject({ status: "completed" });
  }, 60_000);

  it("hands a watch to a workspace owner when the person who set it up leaves", async () => {
    const { watchId, clientId } = await watchFor(M.id, O.ws, "Umbro");
    await sql`delete from workspace_members where workspace_id = ${O.ws} and user_id = ${M.id}`;
    await runDay("2026-11-11", [watchId]);
    const [w] = await sql`select created_by from watches where id = ${watchId}`;
    expect(w.created_by).toBe(O.id);
    expect((await sql`select status from watch_jobs where watch_id = ${watchId}`)[0].status).toBe("completed");
    const [note] = await sql`select * from notifications where user_id = ${O.id} and kind = 'watch_assigned'`;
    expect(note).toMatchObject({ href: `/workspace/clients/${clientId}/watch` });
    expect(note.title).toMatch(/Umbro/);
  });

  it("starts extra workers when there are more watches than one run can finish, and never runs a job twice", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await watchFor(O.id, O.ws, `Brand${String.fromCharCode(65 + i)}`)).watchId);
    const dispatched = vi.fn(() => route("watch-worker"));
    await sql`delete from provider_cache`;
    await sql`update watches set next_run_at = case when id = any(${ids}) then now() else now() + interval '1 day' end`;
    const { runWatchCron } = await import("@/lib/watch/schedule");
    const r = await runWatchCron({ now: new Date("2026-11-12T06:05:00Z"), dispatch: dispatched });
    expect(r.workers).toBe(1); // 10 queued jobs: this run plus one extra worker
    expect(dispatched).toHaveBeenCalledTimes(1);
    const jobs = await sql`select status, attempts from watch_jobs where watch_id = any(${ids})`;
    expect(jobs).toHaveLength(10);
    expect(jobs.every((j) => j.status === "completed" && j.attempts === 1)).toBe(true);
    expect(r.processed).toBeLessThan(10); // the extra worker took some of them
  });
});
