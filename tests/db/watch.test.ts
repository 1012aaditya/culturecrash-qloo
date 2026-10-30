/**
 * Watch Milestone 1 acceptance tests (A–H). Runs every migration into a fresh database, then drives the
 * real code paths: the server action that saves a watch, and the authenticated cron route that enqueues,
 * claims and processes jobs. Only the news providers are fake — global fetch returns fixtures.
 * Requires TEST_DATABASE_ADMIN_URL (a Postgres superuser URL).
 */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ current: null as null | { user: { id: string }; workspace: { workspaceId: string; role: string } } }));
vi.mock("@/lib/data/workspace", () => ({ getCtx: async () => ctx.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const admin = process.env.TEST_DATABASE_ADMIN_URL;
const d = admin ? describe : describe.skip;
const DB = `cc_watch_${Date.now()}`;
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
const signIn = (u: { id: string; ws: string }, role = "owner") => { ctx.current = { user: { id: u.id }, workspace: { workspaceId: u.ws, role } }; };

// ---- Fake providers -------------------------------------------------------------------------------
const calls: { provider: string; q: string }[] = [];
let exaFails = false;
const story = (title: string, link: string, snippet: string, source: string, date?: string) => ({ title, link, snippet, source, ...(date ? { date } : {}) });
/** Extra Nike stories for the relevance test (I). */
let extraNike: ReturnType<typeof story>[] = [];
function serperFixture(q: string) {
  if (q.includes('"Nike"') && extraNike.length) return extraNike;
  if (q.includes('"Nike"')) return [
    story("Nike unveils its fastest racing shoe yet", "https://news.test/nike-racer?utm_source=x", "Nike said the shoe will be sold from November.", "Runner Daily", "3 hours ago"),
    story("Nike unveils its fastest racing shoe yet", "https://other.test/nike-racer-copy", "Nike said the shoe arrives in November, per reports.", "Sports Wire", "5 hours ago"),
    story("Adidas signs a new football star", "https://news.test/adidas-star", "Adidas announced the deal on Tuesday.", "Kick Times", "Oct 28, 2026"),
    story("Ten running shoes ranked", "https://news.test/ranked", "The best trainers of the year.", "Gear Lab", "1 day ago"),
    story("Nike opens a store in Leeds", "https://news.test/nike-leeds", "Nike's new store opens this weekend.", "Local News"),
  ];
  if (q.includes('"Adidas"')) return [story("Adidas posts quarterly results", "https://news.test/adidas-q3", "Adidas reported higher sales.", "Biz Today", "2 days ago")];
  if (q.includes('"Puma"')) return [story("Puma names a new chief executive", "https://news.test/puma-ceo", "Puma confirmed the appointment.", "Biz Today", "Oct 27, 2026")];
  if (q.includes('"Reebok"')) return [story("Reebok returns to basketball", "https://news.test/reebok", "Reebok is back.", "Hoops", "4 hours ago")];
  return [];
}
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url.startsWith("https://google.serper.dev/news")) {
    calls.push({ provider: "serper", q: body.q });
    return Response.json({ news: serperFixture(body.q) });
  }
  if (url.startsWith("https://api.exa.ai")) {
    calls.push({ provider: "exa", q: body.query });
    if (exaFails) return new Response("upstream down", { status: 500 });
    const name = String(body.query).split(" ")[0];
    return Response.json({ results: [{ title: `${name} expands its sustainability programme`, url: `https://exa.test/${name.toLowerCase()}-green`, publishedDate: "2026-10-29T10:00:00.000Z", highlights: [`${name} said the programme covers all factories.`] }] });
  }
  throw new Error(`unexpected fetch ${url}`);
});

const cron = async (secret: string | null = SECRET) => {
  const { GET } = await import("@/app/api/cron/[job]/route");
  const req = new Request("http://localhost/api/cron/watch", { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  const res = await GET(req, { params: Promise.resolve({ job: "watch" }) } as never);
  return { status: res.status, body: await res.json() };
};

let A: { id: string; ws: string }, B: { id: string; ws: string }, V: { id: string; ws: string };
let nikeClient: string, bobClient: string;
let watchId: string;

d("Watch Milestone 1 (A–H)", () => {
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
    // The app's own connection points at the test database; the cron route and actions use it unchanged.
    Object.assign(process.env, { DATABASE_URL: url.toString(), CRON_SECRET: SECRET, SERPER_API_KEY: "serper-test-key", EXA_API_KEY: "exa-test-key", AUTH_MODE: "local" });
    globalThis.__ccSql = undefined;
    vi.stubGlobal("fetch", fakeFetch);

    A = await user("alice@a.test");
    B = await user("bob@b.test");
    V = await user("vera@a.test");
    await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'vera@a.test', 'viewer')`);
    const [inv] = await as(V.id, (tx) => tx`select id from my_pending_invitations()`);
    await as(V.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`);
    nikeClient = (await as(A.id, (tx) => tx`insert into clients (workspace_id, name, created_by) values (${A.ws}, 'Nike', ${A.id}) returning id`))[0].id;
    bobClient = (await as(B.id, (tx) => tx`insert into clients (workspace_id, name, created_by) values (${B.ws}, 'Reebok', ${B.id}) returning id`))[0].id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await globalThis.__ccSql?.end();
    globalThis.__ccSql = undefined;
    await sql?.end();
    await root?.unsafe(`drop database if exists ${DB} with (force)`);
    await root?.end();
  });
  beforeEach(() => { calls.length = 0; exaFails = false; });

  it("A: a member configures Nike with Adidas and Puma; limits and roles are enforced", async () => {
    const { saveWatchAction } = await import("@/lib/watch/actions");
    signIn(V, "viewer");
    expect(await saveWatchAction(nikeClient, { company: "Nike", competitors: ["Adidas"], keywords: [], frequency: "daily" })).toMatchObject({ ok: false });
    signIn(A);
    expect(await saveWatchAction(nikeClient, { company: "Nike", competitors: ["Adidas", "Puma", "Reebok"], keywords: [], frequency: "daily" })).toMatchObject({ ok: false });
    expect(await saveWatchAction(nikeClient, { company: "Nike", competitors: ["nike"], keywords: [], frequency: "daily" })).toMatchObject({ ok: false });
    expect(await saveWatchAction(nikeClient, { company: "Nike", competitors: ["Adidas", "Puma"], keywords: [], market: "UK", frequency: "daily" })).toMatchObject({ ok: true });

    const [w] = await sql`select * from watches where client_id = ${nikeClient}`;
    watchId = w.id;
    expect(w).toMatchObject({ workspace_id: A.ws, status: "active", frequency: "daily", market: "UK", created_by: A.id, last_success_at: null });
    expect(w.next_run_at.getTime()).toBeLessThanOrEqual(Date.now());
    const targets = await sql`select role, name from watch_targets where watch_id = ${watchId} order by role, name`;
    expect(targets.map((t) => `${t.role}:${t.name}`)).toEqual(["company:Nike", "competitor:Adidas", "competitor:Puma"]);
    // The database enforces the competitor limit even if the app check is bypassed.
    await expect(as(A.id, (tx) => tx`insert into watch_targets (watch_id, workspace_id, role, name) values (${watchId}, ${A.ws}, 'competitor', 'Reebok')`)).rejects.toThrow();
  });

  it("F: the cron route refuses calls without the secret", async () => {
    expect((await cron(null)).status).toBe(401);
    expect((await cron("wrong-secret-wrong-secret")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("B: the scheduled route enqueues and processes the due watch through the production path", async () => {
    const r = await cron();
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ enqueued: 1, processed: 1 });
    const jobs = await sql`select * from watch_jobs where watch_id = ${watchId}`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "completed", attempts: 1, run_key: `schedule:${new Date().toISOString().slice(0, 10)}` });
    expect(jobs[0].added).toBeGreaterThan(0);
    expect(calls.filter((c) => c.provider === "serper")).toHaveLength(6);
    expect(calls.filter((c) => c.provider === "exa")).toHaveLength(3);
    const [w] = await sql`select * from watches where id = ${watchId}`;
    expect(w.last_success_at).not.toBeNull();
    expect(w.next_run_at.getTime()).toBeGreaterThan(Date.now() + 11 * 3_600_000);
    // Every call is in the cost ledger, linked to the job.
    const ledger = await sql`select provider, cost_usd_estimated, cached, status from research_sources where watch_job_id = ${jobs[0].id}`;
    expect(ledger).toHaveLength(9);
    expect(ledger.every((l) => !l.cached && Number(l.cost_usd_estimated) > 0 && l.status !== "error")).toBe(true);
  });

  it("C: stories are stored with provenance, honest dates and the right company — never full text", async () => {
    const docs = await sql`select d.*, t.name as target from research_documents d left join watch_targets t on t.id = d.watch_target_id where d.watch_id = ${watchId}`;
    const by = (u: string) => docs.find((x) => x.canonical_url === u)!;
    const racer = by("https://news.test/nike-racer");
    expect(racer).toBeTruthy(); // tracking parameters removed
    expect(racer).toMatchObject({ target: "Nike", provider: "serper", source_type: "news", publisher: "Runner Daily", published_precision: "approximate", run_id: null, project_id: null, workspace_id: A.ws });
    expect(racer.discovery_query).toBe('"Nike"');
    expect(racer.content_hash).toMatch(/^[0-9a-f]{16,}$/);
    expect(racer.published_at.getTime()).toBeLessThan(racer.retrieved_at.getTime());
    // An Adidas story found by the Nike search belongs to Adidas, with the day the source gave.
    expect(by("https://news.test/adidas-star")).toMatchObject({ target: "Adidas", published_precision: "day" });
    // No date from the source means no publication date — discovery time is kept separately.
    const leeds = by("https://news.test/nike-leeds");
    expect(leeds.published_at).toBeNull();
    expect(leeds.published_precision).toBeNull();
    expect(leeds.retrieved_at).not.toBeNull();
    // Exa's exact timestamps are exact.
    expect(by("https://exa.test/puma-green")).toMatchObject({ target: "Puma", provider: "exa", published_precision: "exact" });
    // A story that names nobody being watched isn't kept.
    expect(docs.find((x) => x.canonical_url === "https://news.test/ranked")).toBeUndefined();
    // The same headline on another site is kept but linked, so the timeline shows it once.
    expect(by("https://other.test/nike-racer-copy").duplicate_of).toBe(racer.id);
    for (const doc of docs) {
      expect((doc.excerpt ?? "").length).toBeLessThanOrEqual(500);
      expect(doc.extraction_status).toBe("snippet");
    }
  });

  it("D: re-running is idempotent — no new job today, and a fresh job adds no duplicates or cost", async () => {
    const before = (await sql`select count(*)::int as n from research_documents where watch_id = ${watchId}`)[0].n;
    const r = await cron();
    expect(r.body.result).toMatchObject({ enqueued: 0, processed: 0 });
    expect(calls).toHaveLength(0);
    // Even if a second job for the same watch runs today (a manual check), cached results add nothing.
    const { claimNext } = await import("@/lib/watch/schedule");
    const { processWatchJob } = await import("@/lib/watch/collect");
    await sql`update watches set last_success_at = null where id = ${watchId}`; // same plan as the first run
    await sql`insert into watch_jobs (watch_id, workspace_id, run_key) values (${watchId}, ${A.ws}, 'manual:test')`;
    const job = await claimNext();
    const out = await processWatchJob(job!);
    expect(out).toMatchObject({ status: "completed", added: 0 });
    expect(calls).toHaveLength(0);
    const after = (await sql`select count(*)::int as n from research_documents where watch_id = ${watchId}`)[0].n;
    expect(after).toBe(before);
    const ledger = await sql`select cached, cost_usd_estimated from research_sources where watch_job_id = ${job!.id}`;
    expect(ledger.every((l) => l.cached && Number(l.cost_usd_estimated) === 0)).toBe(true);
  });

  it("E: concurrent cron calls create one job per watch and process it once", async () => {
    signIn(B);
    const { saveWatchAction } = await import("@/lib/watch/actions");
    expect(await saveWatchAction(bobClient, { company: "Reebok", competitors: [], keywords: [], frequency: "daily" })).toMatchObject({ ok: true });
    const [r1, r2, r3] = await Promise.all([cron(), cron(), cron()]);
    expect([r1, r2, r3].every((r) => r.status === 200)).toBe(true);
    expect(r1.body.result.enqueued + r2.body.result.enqueued + r3.body.result.enqueued).toBe(1);
    expect(r1.body.result.processed + r2.body.result.processed + r3.body.result.processed).toBe(1);
    const jobs = await sql`select j.* from watch_jobs j join watches w on w.id = j.watch_id where w.client_id = ${bobClient}`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "completed", attempts: 1 });
    expect(calls.filter((c) => c.provider === "serper")).toHaveLength(2);
  });

  it("F: Row Level Security keeps watches, stories and jobs inside their workspace", async () => {
    const seen = await as(B.id, (tx) => tx`select
      (select count(*)::int from watches where id = ${watchId}) as w,
      (select count(*)::int from watch_targets where watch_id = ${watchId}) as t,
      (select count(*)::int from watch_jobs where watch_id = ${watchId}) as j,
      (select count(*)::int from research_documents where watch_id = ${watchId}) as d`);
    expect(seen[0]).toEqual({ w: 0, t: 0, j: 0, d: 0 });
    // Bob can't attach a watch to Alice's client, or move his own watch into her workspace.
    await expect(as(B.id, (tx) => tx`insert into watches (workspace_id, client_id, created_by) values (${B.ws}, ${nikeClient}, ${B.id})`)).rejects.toThrow();
    await expect(as(B.id, (tx) => tx`insert into watches (workspace_id, client_id, created_by) values (${A.ws}, ${nikeClient}, ${B.id})`)).rejects.toThrow();
    // A viewer in Alice's workspace can read but not change the watch.
    expect((await as(V.id, (tx) => tx`select id from watches where id = ${watchId}`))).toHaveLength(1);
    expect(await as(V.id, (tx) => tx`update watches set status = 'paused' where id = ${watchId} returning id`)).toHaveLength(0);
    // Bob's server action can't reach Alice's client.
    signIn(B);
    const { setWatchStatusAction } = await import("@/lib/watch/actions");
    expect(await setWatchStatusAction(nikeClient, "paused")).toMatchObject({ ok: false });
    expect((await sql`select status from watches where id = ${watchId}`)[0].status).toBe("active");
  });

  it("G: an exhausted budget stops collection before any provider is called, and says so", async () => {
    await sql`update workspaces set research_budget_usd_monthly = 0 where id = ${A.ws}`;
    await sql`delete from provider_cache`;
    await sql`update watches set next_run_at = now() where id = ${watchId}`;
    await sql`delete from watch_jobs where watch_id = ${watchId} and run_key like 'schedule:%'`;
    const r = await cron();
    expect(r.body.result.processed).toBe(1);
    expect(calls).toHaveLength(0);
    const [job] = await sql`select * from watch_jobs where watch_id = ${watchId} and run_key like 'schedule:%'`;
    expect(job.status).toBe("failed");
    expect(job.error_message).toMatch(/budget/i);
    expect(job.retryable).toBe(false); // retrying later today can't fix a used-up budget
    const [w] = await sql`select last_attempted_at, last_success_at from watches where id = ${watchId}`;
    expect(w.last_attempted_at).not.toBeNull();
    await sql`update workspaces set research_budget_usd_monthly = 25 where id = ${A.ws}`;
  });

  it("H: one provider failing doesn't stop the other, and health reports it honestly", async () => {
    exaFails = true;
    await sql`delete from provider_cache`;
    await sql`update watches set next_run_at = now(), last_success_at = null where id = ${watchId}`;
    await sql`delete from watch_jobs where watch_id = ${watchId}`;
    await sql`delete from research_documents where watch_id = ${watchId}`;
    const r = await cron();
    expect(r.body.result.processed).toBe(1);
    const [job] = await sql`select * from watch_jobs where watch_id = ${watchId}`;
    expect(job.status).toBe("partially_completed");
    expect(job.error_message).toMatch(/3 of 9 searches failed, even after a retry/);
    expect(job.retryable).toBe(true);
    expect(job.added).toBeGreaterThan(0);
    const docs = await sql`select provider from research_documents where watch_id = ${watchId}`;
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((x) => x.provider === "serper")).toBe(true);
    const errors = await sql`select provider, status, http_status from research_sources where watch_job_id = ${job.id} and status = 'error'`;
    // Each failing Exa search was tried, then retried once at the end of the job.
    expect(errors).toHaveLength(6);
    expect(errors.every((e) => e.provider === "exa" && e.http_status === 500)).toBe(true);
    // The page's read model shows Exa failing and Serper working.
    const { getWatchView } = await import("@/lib/watch/data");
    const view = await getWatchView({ user: { id: A.id }, workspace: { workspaceId: A.ws } } as never, nikeClient);
    const health = Object.fromEntries(view!.health.map((h) => [h.provider, h]));
    expect(health.exa).toMatchObject({ configured: true, lastStatus: "error", failures7d: 6 });
    expect(health.serper).toMatchObject({ configured: true, lastStatus: "ok", failures7d: 0 });
    expect(view!.lastJob).toMatchObject({ status: "partially_completed" });
    expect(view!.items.every((i) => i.target)).toBe(true);
  }, 60_000);

  it("I: hides listings and name clashes with a reason, groups one event across outlets, and counts only what's relevant", async () => {
    extraNike = [
      story("Nike posts record third-quarter revenue as China sales rebound", "https://wire-a.test/nike-q3", "Nike reported record revenue for the third quarter.", "Wire A", "2 hours ago"),
      story("Nike third-quarter revenue beats forecasts on China sales rebound", "https://wire-b.test/nike-q3", "Nike's Q3 revenue beat forecasts as China sales rebounded.", "Wire B", "3 hours ago"),
      story("Nike third quarter: revenue record, China sales rebound strongly", "https://wire-c.test/nike-q3", "Nike's third-quarter revenue set a record.", "Wire C", "4 hours ago"),
      story("Nike the racehorse wins again, says jockey", "https://racing.test/nike-horse", "The horse Nike and her jockey took the stakes.", "Racing Post Test", "1 hour ago"),
      story("Mens Nike hoodie size L", "https://listings.test/hoodie", "Grey Nike hoodie in good used condition, free returns.", "Listings Test", "1 hour ago"),
    ];
    await sql`delete from provider_cache`;
    await sql`delete from watch_jobs where watch_id = ${watchId}`;
    await sql`delete from research_documents where watch_id = ${watchId}`;
    await sql`update watches set next_run_at = now() where id = ${watchId}`;
    exaFails = false;
    await cron();
    const docs = await sql`select canonical_url, watch_relevance, watch_relevance_reason, watch_event_lead, id from research_documents where watch_id = ${watchId} and provider = 'serper'`;
    const by = (u: string) => docs.find((x) => x.canonical_url === u)!;
    expect(by("https://racing.test/nike-horse")).toMatchObject({ watch_relevance: "name_clash" });
    expect(by("https://listings.test/hoodie").watch_relevance).toBe("listing");
    expect(by("https://listings.test/hoodie").watch_relevance_reason).toMatch(/for sale/);
    // One event: the earliest-published story leads, the other two point at it.
    const lead = by("https://wire-c.test/nike-q3");
    expect(lead.watch_event_lead).toBeNull();
    expect([by("https://wire-a.test/nike-q3").watch_event_lead, by("https://wire-b.test/nike-q3").watch_event_lead]).toEqual([lead.id, lead.id]);

    const { getWatchView } = await import("@/lib/watch/data");
    const view = await getWatchView({ user: { id: A.id }, workspace: { workspaceId: A.ws } } as never, nikeClient);
    const card = view!.items.find((i) => i.id === lead.id)!;
    expect(card.related.map((r) => r.url).sort()).toEqual(["https://wire-a.test/nike-q3", "https://wire-b.test/nike-q3"]);
    expect(card.alsoReportedBy).toBe(2);
    expect(view!.items.some((i) => i.url === "https://wire-a.test/nike-q3" || i.url === "https://racing.test/nike-horse")).toBe(false);
    expect(view!.hidden.map((h) => h.kind).sort()).toEqual(["listing", "name_clash"]);
    // Daily counts leave the hidden two out, and see the three Q3 stories as one event.
    const [nike] = await as(A.id, (tx) => tx`select c.stories_seen, c.events_seen from watch_daily_counts c join watch_targets t on t.id = c.watch_target_id
      where c.watch_id = ${watchId} and t.name = 'Nike'`);
    expect(nike.stories_seen - nike.events_seen).toBe(2);
    expect(await sql`select 1 from research_documents d join watch_observations o on o.document_id = d.id where d.watch_relevance <> 'relevant'`).not.toHaveLength(0);
    extraNike = [];
  });
});
