/**
 * Website and feed watching rules. Pure functions: what counts as noise on a page, when a change is worth
 * reporting, how a fetch failure is described, and how RSS/Atom feeds are read — all unit-tested.
 */
import { decodeEntities } from "@/lib/research/deep/providers/http";
import type { PageResult } from "@/lib/research/deep/fetch-page";

/** Snapshots keep at most this much normalised text. */
export const SNAPSHOT_MAX_CHARS = 20_000;
/** Pages that block us, or that robots.txt disallows, are only re-tried weekly. */
export const BLOCKED_RECHECK_DAYS = 7;
/** Feed items older than this aren't added on a feed's first check. */
export const FEED_MAX_AGE_DAYS = 14;

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MASKS: [RegExp, string][] = [
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi, "<date>"],
  [new RegExp(`\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, "gi"), "<date>"],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? (?:${MONTHS})\\.?,? \\d{4}\\b`, "gi"), "<date>"],
  [/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, "<date>"],
  [/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "<time>"],
  [/\b(?:\d+|an?|one)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b/gi, "<ago>"],
  [/\b(?:just now|yesterday|today)\b/gi, "<ago>"],
  [/[©Ⓒ]\s*(?:\d{4}\s*[-–]\s*)?\d{4}/g, "©"],
  // Session ids, cache busters, tracking tokens: long runs of hex or base64-ish characters.
  [/\b[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]{14,}\b|\b[a-f0-9]{16,}\b/g, "<id>"],
  // Tracking parameters: drop the pair, then tidy a separator left dangling ("a?&b" → "a?b", "a?" → "a").
  [/(?<=[?&])(?:utm_[a-z]+|gclid|fbclid|mc_[a-z]+|ref|session(?:id)?|token)=[^\s&#]*&?/gi, ""],
  [/[?&](?=\s|$)/g, ""],
];
/** Lines that are pure page furniture: cookie banners, cart counters, "skip to content". */
const NOISE_LINE = /^(?:<date>|<time>|<ago>|©.*|\d+|[\W_]+|skip to (?:main )?content|(?:cart|bag|basket)\s*\(?\d*\)?|loading\.*|menu|close|search)$|\bcookies?\b.*\b(?:accept|consent|preferences|settings)\b|\b(?:accept|reject) all\b/i;

/** Page text as a list of comparable lines: entities decoded, whitespace collapsed, volatile bits masked. */
export function normalizeLines(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const raw of text.split(/\n+/)) {
    let line = decodeEntities(raw);
    for (const [re, to] of MASKS) line = line.replace(re, to);
    line = line.replace(/\s+/g, " ").trim();
    if (line.length < 3 || NOISE_LINE.test(line) || seen.has(line)) continue;
    if (total + line.length > SNAPSHOT_MAX_CHARS) break;
    seen.add(line);
    out.push(line);
    total += line.length;
  }
  return out;
}

export type PageDiff = { added: string[]; removed: string[]; meaningful: boolean };

/**
 * Compares a page with its recent snapshots (newest first). A line only counts as added if none of the
 * recent snapshots had it, so banners that rotate between a few messages don't register; a line only
 * counts as removed if every recent snapshot had it. Small edits (under 30 characters in all, with no
 * added line of 20 or more) are ignored.
 */
export function pageDiff(lines: string[], recent: string[][]): PageDiff {
  if (!recent.length) return { added: [], removed: [], meaningful: false };
  const current = new Set(lines);
  const anyRecent = new Set(recent.flat());
  const everyRecent = recent.slice(1).reduce((acc, snap) => { const s = new Set(snap); return new Set([...acc].filter((l) => s.has(l))); }, new Set(recent[0]));
  const added = lines.filter((l) => !anyRecent.has(l));
  const removed = recent[0].filter((l) => !current.has(l) && everyRecent.has(l));
  const chars = [...added, ...removed].reduce((n, l) => n + l.length, 0);
  return { added, removed, meaningful: chars >= 30 || added.some((l) => l.length >= 20) };
}

/** A short, human summary of a change for the timeline (at most 500 characters). */
export function summarizeChange(diff: PageDiff): string {
  const part = (label: string, list: string[]) => (list.length ? `${label}: ${list.slice(0, 4).join(" · ")}${list.length > 4 ? ` (+${list.length - 4} more)` : ""}` : "");
  const s = [part("Added", diff.added), part("Removed", diff.removed)].filter(Boolean).join(" — ");
  return s.length > 500 ? `${s.slice(0, 499).trimEnd()}…` : s;
}

export type PageStatus = "ok" | "blocked" | "robots" | "needs_browser" | "error";
const CHALLENGE = /verify (?:that )?you(?:'re| are) (?:a )?human|attention required|access denied|enable (?:javascript|cookies)|javascript is disabled|are you a robot|captcha|request unsuccessful|pardon our interruption|bot (?:detection|protection)/i;

/**
 * Describes a fetch honestly. Bot walls and refusals are "blocked" — and are never worked around;
 * a page that only renders with JavaScript is "needs_browser".
 */
export function classifyFetch(r: Pick<PageResult, "status" | "error" | "text"> & Partial<Pick<PageResult, "title" | "httpStatus">>): { status: PageStatus; detail: string | null } {
  if (r.status === "extracted") return { status: "ok", detail: null };
  if (r.status === "blocked_by_robots") return { status: "robots", detail: "The site's robots.txt asks automated visitors not to read this page." };
  const http = Number(r.error?.match(/HTTP (\d{3})/)?.[1]);
  // A 202 with almost nothing readable is the classic bot-challenge interstitial (its text sits in <noscript>).
  const challenge = r.httpStatus === 202 && r.error === "Too little readable text";
  if ([401, 403, 429, 451, 503].includes(http) || challenge || CHALLENGE.test(`${r.title ?? ""}\n${r.text}`)) {
    return { status: "blocked", detail: "The site blocks automated visits. We don't work around that; news coverage still covers this company." };
  }
  if (r.error === "Too little readable text") return { status: "needs_browser", detail: "The page only shows its content with JavaScript, which we don't run." };
  return { status: "error", detail: (r.error ?? "The page couldn't be read.").slice(0, 300) };
}

export type FeedItem = { title: string; url: string; publishedAt: string | null; summary: string };

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<(?:[a-z]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${name}>`, "i"));
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim() : null;
};
const clean = (s: string | null) => decodeEntities((s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const date = (s: string | null) => { const d = s ? new Date(s.trim()) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

/** Reads an RSS 2.0 or Atom feed without running anything. Returns null when the text isn't a feed. */
export function parseFeed(xml: string, base: string): { title: string | null; items: FeedItem[] } | null {
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) return null;
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const items = blocks.flatMap((b): FeedItem[] => {
    const title = clean(tag(b, "title"));
    const href = b.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ?? tag(b, "link") ?? tag(b, "guid");
    let url: string | null = null;
    try { url = href ? new URL(decodeEntities(href.trim()), base).toString() : null; } catch { url = null; }
    if (!title || !url || !/^https?:/.test(url)) return [];
    return [{ title: title.slice(0, 500), url, publishedAt: date(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "date")), summary: clean(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content")).slice(0, 1500) }];
  });
  const head = xml.replace(/<item\b[\s\S]*|<entry\b[\s\S]*/i, "");
  return { title: clean(tag(head, "title")) || null, items };
}

/** A short name for a watched page, e.g. "puma.com/en/newsroom". */
export function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path.length > 40 ? `${path.slice(0, 39)}…` : path}`;
  } catch {
    return url.slice(0, 60);
  }
}
