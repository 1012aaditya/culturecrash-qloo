/**
 * Watch Milestone 3 tests: website pages (baseline, noise ignored, real changes reported), automatic
 * newsroom-feed discovery and feed items, honest statuses for blocked / robots / browser-only pages with
 * weekly re-tries, YouTube videos with engagement history inside the daily quota, and the websites editor.
 * Drives the real daily job against a fresh database; websites, YouTube and DNS are fake.
 * Requires TEST_DATABASE_ADMIN_URL (a Postgres superuser URL).
 */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ current: null as null | { user: { id: string }; workspace: { workspaceId: string; role: string } } }));
vi.mock("@/lib/data/workspace", () => ({ getCtx: async () => ctx.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// Every test host resolves to a public address, so the real SSRF guard runs and passes.
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

const admin = process.env.TEST_DATABASE_ADMIN_URL;
const d = admin ? describe : describe.skip;
const DB = `cc_watch3_${Date.now()}`;
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

// ---- Fake web -------------------------------------------------------------------------------------
const site = {
  newsroomExtra: [] as string[],
  banner: "Free shipping on orders over $50",
  stamp: "Updated Oct 30, 2026 at 10:42 am",
  feedItems: [
    { title: "Puma and Ferrari extend partnership", link: "https://brand.test/news/ferrari", date: new Date(Date.now() - 2 * 86_400_000).toUTCString() },
    { title: "An old announcement from last year", link: "https://brand.test/news/old", date: "Mon, 03 Mar 2025 08:00:00 GMT" },
  ],
  videoViews: 1000,
};
const hits = new Map<string, number>();
const html = (body: string, head = "") => new Response(`<html><head><title>Puma Newsroom</title>${head}</head><body><main>${body}</main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  const key = `${url.host}${url.pathname}`;
  hits.set(key, (hits.get(key) ?? 0) + 1);
  if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /private\n", { headers: { "content-type": "text/plain" } });
  switch (key) {
    case "brand.test/newsroom":
      return html([
        "<p>Newsroom</p>", `<p>${site.stamp}</p>`, `<div class="banner">${site.banner}</div>`,
        "<li>Puma reports third-quarter results</li>", "<li>Puma opens a flagship store in Mumbai</li>",
        ...site.newsroomExtra.map((x) => `<li>${x}</li>`), `<p>${"Background copy about the company. ".repeat(8)}</p>`,
      ].join(""), '<link rel="alternate" type="application/rss+xml" href="/feed.xml">');
    case "brand.test/feed.xml":
      return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Puma News</title>${site.feedItems.map((i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.date}</pubDate><description>About ${i.title}</description></item>`).join("")}</channel></rss>`,
      { headers: { "content-type": "application/rss+xml" } });
    case "blocked.test/":
      return new Response("Access denied", { status: 403, headers: { "content-type": "text/html" } });
    case "js.test/":
      return html("<div id=root>Loading</div>");
    case "www.googleapis.com/youtube/v3/search":
      return Response.json({ items: [{ id: { videoId: "vid1" }, snippet: { title: "Puma Speedcat review", description: "Is the Puma Speedcat worth it?", channelTitle: "Sneaker Talk", publishedAt: "2026-10-29T10:00:00Z" } }] });
    case "www.googleapis.com/youtube/v3/videos":
      return Response.json({ items: [{ id: "vid1", statistics: { viewCount: String(site.videoViews), likeCount: "50", commentCount: "7" } }] });
    case "google.serper.dev/news":
      return Response.json({ news: [] });
    case "api.exa.ai/search":
      return Response.json({ results: [] });
  }
  throw new Error(`unexpected fetch ${url}`);
});

/** Runs the daily job as if it were `day`, with the cache cleared and the watch due. */
async function runDay(day: string, watchId: string) {
  await sql`delete from provider_cache`;
  await sql`update watches set next_run_at = now() where id = ${watchId}`;
  const { runWatchCron } = await import("@/lib/watch/schedule");
  return runWatchCron({ now: new Date(`${day}T06:05:00Z`), dispatch: async () => ({}) });
}
const docs = (watchId: string, provider: string) => sql`select * from research_documents where watch_id = ${watchId} and provider = ${provider} order by retrieved_at`;

let O: { id: string; ws: string };
let watchId: string, clientId: string;

d("Watch Milestone 3: websites, feeds and YouTube", () => {
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
    Object.assign(process.env, { DATABASE_URL: url.toString(), CRON_SECRET: "test-cron-secret-0123456789", SERPER_API_KEY: "serper-test-key", EXA_API_KEY: "exa-test-key", YOUTUBE_API_KEY: "youtube-test-key", AUTH_MODE: "local" });
    globalThis.__ccSql = undefined;
    vi.stubGlobal("fetch", fakeFetch);
    O = await user("olivia@o.test");
    ctx.current = { user: { id: O.id }, workspace: { workspaceId: O.ws, role: "owner" } };
    const [c] = await as(O.id, (tx) => tx`insert into clients (workspace_id, name, created_by) values (${O.ws}, 'Puma', ${O.id}) returning id`);
    clientId = c.id;
    const { saveWatchAction } = await import("@/lib/watch/actions");
    expect(await saveWatchAction(clientId, { company: "Puma", competitors: ["Nike"], keywords: [], frequency: "daily" })).toMatchObject({ ok: true });
    watchId = (await sql`select id from watches where client_id = ${clientId}`)[0].id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await globalThis.__ccSql?.end();
    globalThis.__ccSql = undefined;
    await sql?.end();
    await root?.unsafe(`drop database if exists ${DB} with (force)`);
    await root?.end();
  });
  beforeEach(() => hits.clear());

  it("validates the websites editor and enforces the per-company limit", async () => {
    const { saveWatchSourcesAction } = await import("@/lib/watch/actions");
    expect(await saveWatchSourcesAction(clientId, [{ target: "Puma", url: "http://localhost/admin" }])).toMatchObject({ ok: false });
    expect(await saveWatchSourcesAction(clientId, [{ target: "Adidas", url: "https://adidas.test/" }])).toMatchObject({ ok: false, error: /watched companies/ });
    const four = ["a", "b", "c", "d"].map((p) => ({ target: "Puma", url: `https://brand.test/${p}` }));
    expect(await saveWatchSourcesAction(clientId, four)).toMatchObject({ ok: false, error: /at most three/ });
    expect(await saveWatchSourcesAction(clientId, [
      { target: "Puma", url: "https://brand.test/newsroom" },
      { target: "Nike", url: "https://blocked.test/" },
      { target: "Nike", url: "https://js.test/" },
      { target: "Puma", url: "https://brand.test/private" },
    ])).toMatchObject({ ok: true });
    expect(await sql`select kind from watch_pages where watch_id = ${watchId}`).toHaveLength(4);
    // Other workspaces can't see them.
    const eve = await user("eve@e.test");
    expect(await as(eve.id, (tx) => tx`select * from watch_pages where watch_id = ${watchId}`)).toHaveLength(0);
  });

  it("first check: takes a baseline, finds the newsroom feed, adds recent feed items and a YouTube video", async () => {
    await runDay("2026-11-01", watchId);
    const pages = await sql`select url, kind, status, status_detail, discovered_from from watch_pages where watch_id = ${watchId} order by url`;
    const by = (u: string) => pages.find((p) => p.url === u)!;
    expect(by("https://brand.test/newsroom").status).toBe("ok");
    expect(by("https://blocked.test/")).toMatchObject({ status: "blocked" });
    expect(by("https://js.test/").status).toBe("needs_browser");
    expect(by("https://brand.test/private").status).toBe("robots");
    expect(hits.get("brand.test/private")).toBeUndefined(); // robots.txt respected: never fetched
    expect(by("https://brand.test/feed.xml")).toMatchObject({ kind: "feed", status: "ok" });
    expect(by("https://brand.test/feed.xml").discovered_from).not.toBeNull();

    expect(await sql`select 1 from watch_page_snapshots where watch_id = ${watchId}`).toHaveLength(1);
    expect(await docs(watchId, "page")).toHaveLength(0); // a baseline isn't a change
    const feed = await docs(watchId, "rss");
    expect(feed.map((x) => x.canonical_url)).toEqual(["https://brand.test/news/ferrari"]); // the year-old item is skipped
    expect(feed[0]).toMatchObject({ source_type: "brand_site", publisher: "Puma News", published_precision: "exact" });

    const [video] = await docs(watchId, "youtube");
    expect(video).toMatchObject({ source_type: "video", external_id: "vid1", publisher: "Sneaker Talk", metrics: { views: 1000, likes: 50, comments: 7 } });
    expect(await sql`select views from watch_video_stats where document_id = ${video.id}`).toEqual([{ views: "1000" }]);
    const [job] = await sql`select status from watch_jobs where watch_id = ${watchId}`;
    expect(job.status).toBe("completed"); // site problems don't fail the run
  });

  it("ignores date-only changes, reports real ones, and refreshes video counts", async () => {
    // Only the "Updated …" stamp changes. (Banners that rotate are learnt from snapshot history; see the unit tests.)
    Object.assign(site, { stamp: "Updated Oct 31, 2026 at 9:15 am", videoViews: 1500 });
    await runDay("2026-11-02", watchId);
    expect(await docs(watchId, "page")).toHaveLength(0);
    expect(hits.get("blocked.test/")).toBeUndefined(); // blocked sites wait a week
    const [video] = await docs(watchId, "youtube");
    expect((await sql`select views from watch_video_stats where document_id = ${video.id} order by fetched_at`).map((r) => Number(r.views))).toEqual([1000, 1500]);
    expect(video.metrics.views).toBe(1500);

    site.newsroomExtra = ["Puma names a new chief executive officer"];
    site.feedItems = [{ title: "Puma names a new chief executive", link: "https://brand.test/news/ceo", date: new Date().toUTCString() }, ...site.feedItems];
    await runDay("2026-11-03", watchId);
    const [change] = await docs(watchId, "page");
    expect(change).toMatchObject({ source_type: "brand_site", published_at: null, excerpt: "Added: Puma names a new chief executive officer" });
    expect(change.title).toMatch(/page changed \(brand\.test\/newsroom\)/);
    expect((await sql`select last_changed_at from watch_pages where url = 'https://brand.test/newsroom'`)[0].last_changed_at).not.toBeNull();
    expect((await docs(watchId, "rss")).map((x) => x.canonical_url)).toEqual(["https://brand.test/news/ferrari", "https://brand.test/news/ceo"]);
  });

  it("re-tries blocked sites after a week", async () => {
    await sql`update watch_pages set last_checked_at = now() - interval '8 days' where url = 'https://blocked.test/'`;
    await runDay("2026-11-11", watchId);
    expect(hits.get("blocked.test/")).toBe(1);
    expect((await sql`select status from watch_pages where url = 'https://blocked.test/'`)[0].status).toBe("blocked");
  });

  it("stops searching YouTube once today's quota share is used, without failing the run", async () => {
    // Someone else has used today's quota on the shared key.
    const [job] = await sql`select id from watch_jobs where watch_id = ${watchId} limit 1`;
    await sql`insert into research_sources (watch_job_id, workspace_id, provider, endpoint, params, status, result_count, duration_ms, units, cost_usd_estimated, cached)
      values (${job.id}, ${O.ws}, 'youtube', 'search', '{}', 'ok', 0, 0, 7950, 0, false)`;
    await runDay("2026-11-12", watchId);
    expect(hits.get("www.googleapis.com/youtube/v3/search")).toBeUndefined();
    expect((await sql`select status from watch_jobs where watch_id = ${watchId} and run_key = 'schedule:2026-11-12'`)[0].status).toBe("completed");
  });

  it("shows sources, item kinds and video counts on the Watch page", async () => {
    const { getWatchView } = await import("@/lib/watch/data");
    const view = await getWatchView({ user: { id: O.id }, workspace: { workspaceId: O.ws } } as never, clientId);
    expect(view!.sources.map((s) => `${s.target}:${s.kind}:${s.status}`).sort()).toEqual(["Nike:page:blocked", "Nike:page:needs_browser", "Puma:feed:ok", "Puma:page:ok", "Puma:page:robots"]);
    expect(view!.sources.find((s) => s.kind === "feed")!.discovered).toBe(true);
    const change = view!.items.find((i) => i.provider === "page")!;
    expect(change.url).toBe("https://brand.test/newsroom"); // links to the page, not the internal change marker
    expect(view!.items.find((i) => i.provider === "youtube")!.metrics.views).toBe(1500);
    expect(view!.health.map((h) => h.provider)).toEqual(["serper", "exa", "youtube"]);
  });
});
