/**
 * Watch search planning and entity matching. Pure functions: no I/O, so the rules that decide what
 * gets searched and which company a result is about are fully unit-tested.
 */
import type { Hit } from "@/lib/research/deep/types";

export type WatchTarget = { id: string; role: "company" | "competitor"; name: string; aliases: string[] };
export type WatchTask = {
  key: string;
  targetId: string;
  provider: "serper" | "exa" | "youtube";
  query: string;
  /** Serper results page. Page 2 runs only when page 1 came back full (see `afterFull`). */
  page: number;
  /** The page-1 task whose full result list makes this page worth fetching. */
  afterFull?: string;
  /** Serper's recency window: past day after a recent success, otherwise past week. */
  window: "d" | "w";
  /** Exa's lower bound on publication time (ISO). */
  since: string;
  /** Upper bound on publication time (ISO); set only for history backfill. */
  until?: string;
};

const DAY = 86_400_000;
/** What a company does that's worth watching, used when the watch has no keywords of its own. */
const DEFAULT_TOPICS = ["launch", "campaign", "partnership", "collaboration", "announces"];

/**
 * Per target: Serper news for the name on its own and for the name with the watch's topics — each with a
 * second page of results when the first is full — plus one Exa news search from just before the last
 * successful check, and — when YouTube is set up — one YouTube search. A daily run for a company and two
 * competitors makes 9 to 18 calls.
 */
export function buildWatchPlan(targets: WatchTarget[], opts: { keywords: string[]; lastSuccessAt: Date | null; now?: Date; youtube?: boolean }): WatchTask[] {
  const now = opts.now ?? new Date();
  const recent = opts.lastSuccessAt && now.getTime() - opts.lastSuccessAt.getTime() < 1.5 * DAY;
  const window: "d" | "w" = recent ? "d" : "w";
  // A day of overlap with the last check, so a story indexed late isn't missed; the database drops repeats.
  const since = new Date(opts.lastSuccessAt ? opts.lastSuccessAt.getTime() - DAY : now.getTime() - 7 * DAY).toISOString();
  const topics = (opts.keywords.length ? opts.keywords : DEFAULT_TOPICS).slice(0, 4);
  return targets.flatMap((t) => {
    const name = t.name.trim();
    const base = { targetId: t.id, window, since };
    const nameQ = `"${name}"`;
    const topicsQ = `"${name}" ${topics.map((k) => (/\s/.test(k) ? `"${k}"` : k)).join(" OR ")}`;
    return [
      { ...base, key: `${t.id}:serper:name`, provider: "serper" as const, query: nameQ, page: 1 },
      { ...base, key: `${t.id}:serper:name:p2`, provider: "serper" as const, query: nameQ, page: 2, afterFull: `${t.id}:serper:name` },
      { ...base, key: `${t.id}:serper:topics`, provider: "serper" as const, query: topicsQ, page: 1 },
      { ...base, key: `${t.id}:serper:topics:p2`, provider: "serper" as const, query: topicsQ, page: 2, afterFull: `${t.id}:serper:topics` },
      { ...base, key: `${t.id}:exa`, provider: "exa" as const, query: `${name} ${topics.join(" ")} news`, page: 1 },
      // Videos that name the company, published since the last check (one search: 101 of YouTube's daily quota units).
      ...(opts.youtube ? [{ ...base, key: `${t.id}:youtube`, provider: "youtube" as const, query: nameQ, page: 1 }] : []),
    ];
  });
}

/** Days of history a new watch is filled in with. */
export const BACKFILL_DAYS = 30;
/** History is loaded in chunks of this many days, one job each, so parallel workers share it. */
export const BACKFILL_CHUNK_DAYS = 5;

/** Job run keys for a watch's history: "backfill:d0-7", "backfill:d7-14", … */
export function backfillKeys(days = BACKFILL_DAYS): string[] {
  const keys: string[] = [];
  for (let from = 0; from < days; from += BACKFILL_CHUNK_DAYS) keys.push(`backfill:d${from}-${Math.min(from + BACKFILL_CHUNK_DAYS, days)}`);
  return keys;
}

/** The day range ("days ago", end exclusive) a history job covers. */
export function backfillRange(runKey: string): { from: number; to: number } | null {
  const m = /^backfill:d(\d+)-(\d+)$/.exec(runKey);
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}

/**
 * History backfill, collected exactly like the daily check — the same searches, one UTC day at a time — so
 * every day in the charts was gathered the same way and days can be compared fairly. Each search is limited
 * to its day, so even a vague "2 weeks ago" from Serper lands on the right date. Days `from`..`to` ago.
 */
export function buildBackfillPlan(targets: WatchTarget[], opts: { now?: Date; from?: number; to?: number; keywords?: string[] } = {}): WatchTask[] {
  const now = opts.now ?? new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tasks: WatchTask[] = [];
  for (let ago = opts.from ?? 0; ago < (opts.to ?? BACKFILL_DAYS); ago++) {
    const start = today - ago * DAY;
    const end = Math.min(start + DAY - 1000, now.getTime());
    const day = buildWatchPlan(targets, { keywords: opts.keywords ?? [], lastSuccessAt: null, now });
    for (const t of day) {
      tasks.push({ ...t, key: `${t.key}:day${ago}`, since: new Date(start).toISOString(), until: new Date(end).toISOString(), afterFull: t.afterFull ? `${t.afterFull}:day${ago}` : undefined });
    }
  }
  return tasks;
}

/** Results per Serper page; a full first page means there are probably more worth fetching. */
export const SERPER_PAGE_SIZE = 10;

/** Failed runs in a row after which the watch's owner is told. */
export const FAILING_AFTER = 3;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the text names the target as a whole word (or one of its aliases), case-insensitively. */
export function mentions(text: string, t: Pick<WatchTarget, "name" | "aliases">): boolean {
  return [t.name, ...t.aliases].filter((n) => n.trim().length >= 2)
    .some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n.trim())}($|[^\\p{L}\\p{N}])`, "iu").test(text));
}

/**
 * Which target a result is about. The target whose search found it wins if the result names it;
 * otherwise another target the result names (an Adidas story found by a Nike search is Adidas's);
 * otherwise null — the result doesn't name anyone being watched, so it isn't kept.
 */
export function matchTarget(hit: Pick<Hit, "title" | "snippet">, searchedFor: WatchTarget, all: WatchTarget[]): WatchTarget | null {
  const text = `${hit.title}\n${hit.snippet}`;
  if (mentions(text, searchedFor)) return searchedFor;
  return all.find((t) => t.id !== searchedFor.id && mentions(text, t)) ?? null;
}

/** Excerpts are kept short: the title, link and a snippet identify the story without copying the article. */
export const EXCERPT_MAX = 500;
export const clipExcerpt = (raw: string) => {
  const s = raw.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim(); // some sources return markdown headings
  return s.length > EXCERPT_MAX ? `${s.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : s;
};

/** The hour (UTC) of the daily cron in vercel.json. Hobby fires it somewhere inside that hour. */
export const CRON_HOUR_UTC = 6;

/** At least this long between two checks of the same watch. */
const MIN_GAP_HOURS = { daily: 6, weekly: 6 * 24 + 12 } as const;

/**
 * When a watch is next due: the first scheduled run (CRON_HOUR_UTC) at least MIN_GAP after the last
 * check, minus half an hour so that run's "due within the hour" window always includes it. A check at
 * any time of day — the scheduled run itself, or a manual check at 19:41 UTC — is therefore followed
 * by the very next suitable scheduled run, and a day is never skipped.
 */
export function nextRunAfter(frequency: "daily" | "weekly", from: Date): Date {
  const earliest = new Date(from.getTime() + MIN_GAP_HOURS[frequency] * 3_600_000);
  const slot = new Date(earliest);
  slot.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
  if (slot.getTime() < earliest.getTime()) slot.setUTCDate(slot.getUTCDate() + 1);
  return new Date(slot.getTime() - 30 * 60_000);
}

/** The scheduled run that will actually pick the watch up: the first cron slot from an hour before it's due. */
export function nextCheckAt(nextRunAt: Date): Date {
  const from = nextRunAt.getTime() - 3_600_000;
  const slot = new Date(from);
  slot.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
  if (slot.getTime() < from) slot.setUTCDate(slot.getUTCDate() + 1);
  return slot;
}
