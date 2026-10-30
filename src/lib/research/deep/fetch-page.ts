import { assertPublicUrl } from "./url";
import { decodeEntities, UA, type Fetcher } from "./providers/http";

export type PageResult = {
  status: "extracted" | "blocked_by_robots" | "failed" | "skipped";
  finalUrl: string;
  title: string | null;
  text: string;
  publisher: string | null;
  publishedAt: string | null;
  canonical: string | null;
  language: string | null;
  /** RSS/Atom feeds the page links to (absolute URLs). */
  feeds: string[];
  /** The final response's HTTP status, when one arrived. */
  httpStatus: number | null;
  error: string | null;
  bytes: number;
  durationMs: number;
};

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 20_000;
const robotsCache = new Map<string, { at: number; rules: RobotsRule[] }>();

export type RobotsRule = { allow: boolean; pattern: string };

/**
 * robots.txt check (RFC 9309): rules from our own user-agent group if the site has one, otherwise the
 * "*" group; "*" wildcards and a trailing "$" are honoured; the longest matching rule wins, and Allow wins
 * a tie. A missing robots.txt allows everything.
 */
export async function robotsAllows(url: URL, fetcher: Fetcher, resolve?: Parameters<typeof assertPublicUrl>[1]): Promise<boolean> {
  const key = url.origin;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > 3_600_000) {
    const rules: RobotsRule[] = [];
    try {
      // Redirects are followed by hand so every hop passes the same public-address check as the page.
      let target = `${url.origin}/robots.txt`;
      for (let hop = 0; hop < 3; hop++) {
        const u = await assertPublicUrl(target, resolve);
        const res = await fetcher(u.toString(), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000), redirect: "manual" });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel();
          target = new URL(location, u).toString();
          continue;
        }
        if (res.ok) rules.push(...parseRobots(await res.text()));
        else await res.body?.cancel();
        break;
      }
    } catch {
      // unreachable robots.txt: treat as no restrictions, the page fetch will fail on its own if the host is down
    }
    entry = { at: Date.now(), rules };
    robotsCache.set(key, entry);
  }
  return robotsVerdict(entry.rules, url.pathname + url.search);
}

/** The rules that apply to us: our own user-agent's group(s) when present, otherwise the "*" group(s). */
export function parseRobots(txt: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, field, value] = m;
    const f = field.toLowerCase();
    if (f === "user-agent") {
      // Consecutive User-agent lines share one group; a User-agent after rules starts a new one.
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.trim().toLowerCase());
    } else if ((f === "disallow" || f === "allow") && current) {
      if (value.trim()) current.rules.push({ allow: f === "allow", pattern: value.trim() });
    }
  }
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && a.includes("culturecrash")));
  return (ours.length ? ours : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}

/** Longest matching rule decides; Allow wins ties; no matching rule allows. */
export function robotsVerdict(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    const anchored = r.pattern.endsWith("$");
    const body = anchored ? r.pattern.slice(0, -1) : r.pattern;
    const re = new RegExp(`^${body.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
    if (!re.test(path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow && !best.allow)) best = r;
  }
  return !best || best.allow;
}

/** Pulls readable text and provenance metadata out of HTML without executing anything. */
export function extractHtml(html: string, base?: string): Pick<PageResult, "title" | "text" | "publisher" | "publishedAt" | "canonical" | "language" | "feeds"> {
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
  };
  const title = decodeEntities(meta("og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  let publishedAt = meta("article:published_time") ?? meta("datePublished") ?? meta("pubdate") ?? meta("date") ?? null;
  if (!publishedAt) {
    const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ?? html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ?? null;
    publishedAt = ld;
  }
  const pd = publishedAt ? new Date(publishedAt) : null;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1] ?? null;
  const language = html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,10})["']/i)?.[1]?.toLowerCase() ?? null;
  const feeds = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((l) => /rel=["']alternate["']/i.test(l) && /type=["']application\/(?:rss|atom)\+xml["']/i.test(l))
    .flatMap((l) => { try { const h = l.match(/href=["']([^"']+)["']/i)?.[1]; return h ? [new URL(decodeEntities(h), base).toString()] : []; } catch { return []; } })
    .filter((u, i, all) => /^https?:/.test(u) && all.indexOf(u) === i);
  let body = html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const article = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (article) body = article;
  // One line per block element, so callers can compare pages line by line (decodeEntities collapses whitespace).
  const text = body.replace(/<\/(p|h[1-6]|li|div|section|article|tr|dd|dt|figcaption|blockquote)>|<br\s*\/?>/gi, "\n")
    .split("\n").map(decodeEntities).filter(Boolean).join("\n").slice(0, MAX_TEXT);
  return {
    title, text, feeds, publisher: decodeEntities(meta("og:site_name") ?? "") || null,
    publishedAt: pd && !Number.isNaN(pd.getTime()) ? pd.toISOString() : null, canonical, language,
  };
}

/**
 * Retrieves one page: public-address check on every hop (no SSRF), robots.txt respected,
 * max 3 redirects, HTML/text only, 1.5 MB cap, 9 s timeout. Retrieved text is untrusted data.
 */
export async function fetchPage(url: string, opts: { fetcher?: Fetcher; resolve?: Parameters<typeof assertPublicUrl>[1]; kind?: "page" | "feed" } = {}): Promise<PageResult> {
  const fetcher = opts.fetcher ?? fetch;
  const started = Date.now();
  const feed = opts.kind === "feed";
  const base = { title: null, text: "", publisher: null, publishedAt: null, canonical: null, language: null, feeds: [] as string[], httpStatus: null as number | null, bytes: 0 };
  let current = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const u = await assertPublicUrl(current, opts.resolve);
      if (hop === 0 && !(await robotsAllows(u, fetcher, opts.resolve))) {
        return { ...base, status: "blocked_by_robots", finalUrl: current, error: "Disallowed by robots.txt", durationMs: Date.now() - started };
      }
      const accept = feed ? "application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8" : "text/html,application/xhtml+xml,text/plain;q=0.8";
      const res = await fetcher(u.toString(), { headers: { "User-Agent": UA, Accept: accept }, redirect: "manual", signal: AbortSignal.timeout(9000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        current = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      base.httpStatus = res.status;
      if (!res.ok) {
        await res.body?.cancel();
        return { ...base, status: "failed", finalUrl: current, error: `HTTP ${res.status}`, durationMs: Date.now() - started };
      }
      const type = res.headers.get("content-type") ?? "";
      if (!(feed ? /xml|rss|atom/i : /text\/html|application\/xhtml|text\/plain/i).test(type)) {
        await res.body?.cancel();
        return { ...base, status: "skipped", finalUrl: current, error: `Unsupported content type ${type.split(";")[0] || "unknown"}`, durationMs: Date.now() - started };
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      // Feeds are returned whole (up to the byte cap) for the caller to parse; pages are reduced to readable text.
      if (feed) return { ...base, status: "extracted", text: raw, error: null, finalUrl: current, bytes, durationMs: Date.now() - started };
      const ex = /text\/plain/i.test(type) ? { ...base, text: raw.slice(0, MAX_TEXT) } : extractHtml(raw, current);
      return { ...base, ...ex, status: ex.text.length > 200 ? "extracted" : "failed", error: ex.text.length > 200 ? null : "Too little readable text", finalUrl: current, bytes, durationMs: Date.now() - started };
    }
    return { ...base, status: "failed", finalUrl: current, error: "Too many redirects", durationMs: Date.now() - started };
  } catch (e) {
    return { ...base, status: "failed", finalUrl: current, error: e instanceof Error ? e.message : "Retrieval failed", durationMs: Date.now() - started };
  }
}
