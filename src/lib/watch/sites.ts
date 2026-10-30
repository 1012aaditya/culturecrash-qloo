import "server-only";
import { createHash } from "node:crypto";
import { withUser } from "@/lib/db";
import { fetchPage } from "@/lib/research/deep/fetch-page";
import { canonicalizeUrl, hostOf } from "@/lib/research/deep/url";
import { BLOCKED_RECHECK_DAYS, FEED_MAX_AGE_DAYS, classifyFetch, normalizeLines, pageDiff, pageLabel, parseFeed, summarizeChange } from "./pages";
import { lockWatch } from "./refine";
import { storeItem, type StoreCtx } from "./store";

type Page = { id: string; url: string; kind: "page" | "feed"; watch_target_id: string; status: string; last_checked_at: Date | null };
export type SitesOutcome = { found: number; added: number; checked: number; failed: number };

/** Feeds a page links to are added automatically, up to the per-company limit (enforced again by the database). */
const MAX_FEEDS_PER_COMPANY = 2;

/**
 * Checks the watch's pages and feeds, as the user the watch runs as. A page's first check is its
 * baseline; later checks report a change only when it's meaningful (see pageDiff). Feeds add their new
 * items like news. Sites that block automated visits, or disallow them in robots.txt, are only
 * re-tried weekly and never worked around.
 */
export async function checkSites(ctx: StoreCtx & { userId: string; deadline: number }): Promise<SitesOutcome> {
  const out: SitesOutcome = { found: 0, added: 0, checked: 0, failed: 0 };
  const pages = (await withUser(ctx.userId, (tx) => tx`
    select id, url, kind, watch_target_id, status, last_checked_at from watch_pages
    where watch_id = ${ctx.watchId}
      and (status not in ('blocked', 'robots') or last_checked_at is null or last_checked_at < now() - make_interval(days => ${BLOCKED_RECHECK_DAYS}))
    order by kind desc, created_at`)) as unknown as Page[]; // pages before feeds, so feeds a page links to are checked the same day
  const queue = [...pages];
  for (let page = queue.shift(); page; page = queue.shift()) {
    if (Date.now() > ctx.deadline) break;
    out.checked++;
    const r = page.kind === "feed" ? await checkFeed(ctx, page) : await checkPage(ctx, page);
    out.found += r.found;
    out.added += r.added;
    if (r.failed) out.failed++;
    queue.push(...r.newFeeds);
  }
  return out;
}

type CheckResult = { found: number; added: number; failed: boolean; newFeeds: Page[] };

async function checkPage(ctx: StoreCtx & { userId: string }, page: Page): Promise<CheckResult> {
  const r = await fetchPage(page.url);
  const { status, detail } = classifyFetch(r);
  if (status !== "ok") {
    await setStatus(ctx.userId, page, status, detail);
    return { found: 0, added: 0, failed: status === "error", newFeeds: [] };
  }
  const lines = normalizeLines(r.text);
  const hash = createHash("sha256").update(lines.join("\n")).digest("hex");
  return withUser(ctx.userId, async (tx) => {
    await lockWatch(tx, ctx.watchId);
    const recent = await tx`select content_hash, lines from watch_page_snapshots where page_id = ${page.id} order by fetched_at desc limit 3`;
    const snapshot = () => tx`insert into watch_page_snapshots (workspace_id, watch_id, page_id, watch_job_id, content_hash, lines)
      values (${ctx.ws}, ${ctx.watchId}, ${page.id}, ${ctx.jobId}, ${hash}, ${lines})`;
    let found = 0, added = 0;
    if (!recent.length) {
      await snapshot(); // first look: the baseline the next check compares with
    } else if (recent[0].content_hash !== hash) {
      const diff = pageDiff(lines, recent.map((s) => s.lines as string[]));
      if (diff.meaningful) {
        await snapshot();
        const label = pageLabel(page.url);
        const res = await storeItem(tx, ctx, {
          provider: "page", sourceType: "brand_site", url: `${canonicalizeUrl(page.url) ?? page.url}#change-${hash.slice(0, 12)}`, externalId: null,
          title: `${r.title ? `${r.title.slice(0, 120)} — ` : ""}page changed (${label})`, snippet: summarizeChange(diff),
          publisher: hostOf(page.url), publishedAt: null, usageRestrictions: null, query: null,
        }, page.watch_target_id, `${page.id}:page`, 1);
        found = 1;
        added = res.added ? 1 : 0;
        await tx`update watch_pages set last_changed_at = now() where id = ${page.id}`;
      }
    }
    await tx`update watch_pages set status = 'ok', status_detail = null, consecutive_errors = 0, last_checked_at = now() where id = ${page.id}`;
    // Newsroom feeds the page advertises become watched feeds for the same company.
    const newFeeds: Page[] = [];
    if (r.feeds.length) {
      const [{ n }] = await tx`select count(*)::int as n from watch_pages where watch_target_id = ${page.watch_target_id} and kind = 'feed'`;
      for (const url of r.feeds.slice(0, Math.max(0, MAX_FEEDS_PER_COMPANY - n))) {
        const [row] = await tx`insert into watch_pages (workspace_id, watch_id, watch_target_id, url, kind, discovered_from)
          values (${ctx.ws}, ${ctx.watchId}, ${page.watch_target_id}, ${url}, 'feed', ${page.id})
          on conflict (watch_id, url) do nothing returning id, url, kind, watch_target_id, status, last_checked_at`;
        if (row) newFeeds.push(row as unknown as Page);
      }
    }
    return { found, added, failed: false, newFeeds };
  });
}

async function checkFeed(ctx: StoreCtx & { userId: string }, page: Page): Promise<CheckResult> {
  const r = await fetchPage(page.url, { kind: "feed" });
  const feed = r.status === "extracted" ? parseFeed(r.text, r.finalUrl) : null;
  if (!feed) {
    const c = r.status === "extracted" ? { status: "error" as const, detail: "This address doesn't return an RSS or Atom feed." } : classifyFetch(r);
    await setStatus(ctx.userId, page, c.status, c.detail);
    return { found: 0, added: 0, failed: c.status === "error", newFeeds: [] };
  }
  const oldest = Date.now() - FEED_MAX_AGE_DAYS * 86_400_000;
  return withUser(ctx.userId, async (tx) => {
    await lockWatch(tx, ctx.watchId);
    let found = 0, added = 0;
    for (const [i, item] of feed.items.slice(0, 30).entries()) {
      // Undated items are kept: a feed's order already says they're current, and no date is invented for them.
      if (item.publishedAt && Date.parse(item.publishedAt) < oldest) continue;
      const url = canonicalizeUrl(item.url);
      if (!url) continue;
      found++;
      const res = await storeItem(tx, ctx, {
        provider: "rss", sourceType: "brand_site", url, externalId: null, title: item.title, snippet: item.summary,
        publisher: feed.title ?? hostOf(url), publishedAt: item.publishedAt, publishedPrecision: "exact", usageRestrictions: null, query: null,
      }, page.watch_target_id, `${page.id}:feed`, i + 1);
      if (res.added) added++;
    }
    await tx`update watch_pages set status = 'ok', status_detail = null, consecutive_errors = 0, last_checked_at = now(),
      last_changed_at = case when ${added}::int > 0 then now() else last_changed_at end where id = ${page.id}`;
    return { found, added, failed: false, newFeeds: [] };
  });
}

async function setStatus(userId: string, page: Page, status: string, detail: string | null) {
  await withUser(userId, (tx) => tx`update watch_pages set status = ${status}, status_detail = ${detail}, last_checked_at = now(),
    consecutive_errors = case when ${status}::text = 'error' then consecutive_errors + 1 else 0 end where id = ${page.id}`);
}
