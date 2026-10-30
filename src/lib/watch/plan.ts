/**
 * Watch search planning and entity matching. Pure functions: no I/O, so the rules that decide what
 * gets searched and which company a result is about are fully unit-tested.
 */
import type { Hit } from "@/lib/research/deep/types";

export type WatchTarget = { id: string; role: "company" | "competitor"; name: string; aliases: string[] };
export type WatchTask = {
  key: string;
  targetId: string;
  provider: "serper" | "exa";
  query: string;
  /** Serper's recency window: past day after a recent success, otherwise past week. */
  window: "d" | "w";
  /** Exa's lower bound on publication time (ISO). */
  since: string;
};

const DAY = 86_400_000;
/** What a company does that's worth watching, used when the watch has no keywords of its own. */
const DEFAULT_TOPICS = ["launch", "campaign", "partnership", "collaboration", "announces"];

/**
 * Three searches per target: two Serper news searches (the name on its own, then the name with the
 * watch's topics) and one Exa news search from just before the last successful check. Small and fixed,
 * so a daily run for a company and two competitors stays around nine calls.
 */
export function buildWatchPlan(targets: WatchTarget[], opts: { keywords: string[]; lastSuccessAt: Date | null; now?: Date }): WatchTask[] {
  const now = opts.now ?? new Date();
  const recent = opts.lastSuccessAt && now.getTime() - opts.lastSuccessAt.getTime() < 1.5 * DAY;
  const window: "d" | "w" = recent ? "d" : "w";
  // A day of overlap with the last check, so a story indexed late isn't missed; the database drops repeats.
  const since = new Date(opts.lastSuccessAt ? opts.lastSuccessAt.getTime() - DAY : now.getTime() - 7 * DAY).toISOString();
  const topics = (opts.keywords.length ? opts.keywords : DEFAULT_TOPICS).slice(0, 4);
  return targets.flatMap((t) => {
    const name = t.name.trim();
    return [
      { key: `${t.id}:serper:name`, targetId: t.id, provider: "serper" as const, query: `"${name}"`, window, since },
      { key: `${t.id}:serper:topics`, targetId: t.id, provider: "serper" as const, query: `"${name}" ${topics.map((k) => (/\s/.test(k) ? `"${k}"` : k)).join(" OR ")}`, window, since },
      { key: `${t.id}:exa`, targetId: t.id, provider: "exa" as const, query: `${name} ${topics.join(" ")} news`, window, since },
    ];
  });
}

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

/**
 * When a watch is next due. Half a day short of a full period, so whatever time the last check ran —
 * the scheduled run or a manual check in the afternoon — the next scheduled run picks it up and a day is
 * never skipped, while two checks are still at least 12 hours apart.
 */
export function nextRunAfter(frequency: "daily" | "weekly", from: Date): Date {
  return new Date(from.getTime() + (frequency === "weekly" ? 7 * DAY : DAY) - 12 * 3_600_000);
}

/** The scheduled run that will actually pick the watch up: the first cron slot from an hour before it's due. */
export function nextCheckAt(nextRunAt: Date): Date {
  const from = nextRunAt.getTime() - 3_600_000;
  const slot = new Date(from);
  slot.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
  if (slot.getTime() < from) slot.setUTCDate(slot.getUTCDate() + 1);
  return slot;
}
