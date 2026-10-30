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
  error: string | null;
  bytes: number;
  durationMs: number;
};

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 20_000;
const robotsCache = new Map<string, { at: number; disallow: string[] }>();

/** Minimal robots.txt check for the "*" group (and our UA token). Missing robots.txt allows. */
export async function robotsAllows(url: URL, fetcher: Fetcher, resolve?: Parameters<typeof assertPublicUrl>[1]): Promise<boolean> {
  const key = url.origin;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > 3_600_000) {
    const disallow: string[] = [];
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
        if (res.ok) disallow.push(...parseRobots(await res.text()));
        else await res.body?.cancel();
        break;
      }
    } catch {
      // unreachable robots.txt: treat as no restrictions, the page fetch will fail on its own if the host is down
    }
    entry = { at: Date.now(), disallow };
    robotsCache.set(key, entry);
  }
  const path = url.pathname + url.search;
  return !entry.disallow.some((d) => d && path.startsWith(d));
}

export function parseRobots(txt: string): string[] {
  const out: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, field, value] = m;
    const f = field.toLowerCase();
    if (f === "user-agent") {
      if (sawRule) { applies = false; sawRule = false; }
      const v = value.toLowerCase();
      if (v === "*" || v.includes("culturecrash")) applies = true;
    } else if (f === "disallow" || f === "allow") {
      sawRule = true;
      if (applies && f === "disallow" && value) out.push(value.replace(/\*.*$/, ""));
    }
  }
  return out;
}

/** Pulls readable text and provenance metadata out of HTML without executing anything. */
export function extractHtml(html: string): Pick<PageResult, "title" | "text" | "publisher" | "publishedAt" | "canonical" | "language"> {
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
  let body = html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const article = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (article) body = article;
  const text = decodeEntities(body.replace(/<\/(p|h[1-6]|li|div|br|section)>/gi, "\n")).slice(0, MAX_TEXT);
  return {
    title, text, publisher: decodeEntities(meta("og:site_name") ?? "") || null,
    publishedAt: pd && !Number.isNaN(pd.getTime()) ? pd.toISOString() : null, canonical, language,
  };
}

/**
 * Retrieves one page: public-address check on every hop (no SSRF), robots.txt respected,
 * max 3 redirects, HTML/text only, 1.5 MB cap, 9 s timeout. Retrieved text is untrusted data.
 */
export async function fetchPage(url: string, opts: { fetcher?: Fetcher; resolve?: Parameters<typeof assertPublicUrl>[1] } = {}): Promise<PageResult> {
  const fetcher = opts.fetcher ?? fetch;
  const started = Date.now();
  const base = { title: null, text: "", publisher: null, publishedAt: null, canonical: null, language: null, bytes: 0 };
  let current = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const u = await assertPublicUrl(current, opts.resolve);
      if (hop === 0 && !(await robotsAllows(u, fetcher, opts.resolve))) {
        return { ...base, status: "blocked_by_robots", finalUrl: current, error: "Disallowed by robots.txt", durationMs: Date.now() - started };
      }
      const res = await fetcher(u.toString(), { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(9000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        current = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return { ...base, status: "failed", finalUrl: current, error: `HTTP ${res.status}`, durationMs: Date.now() - started };
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
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
      const ex = /text\/plain/i.test(type) ? { ...base, text: raw.slice(0, MAX_TEXT) } : extractHtml(raw);
      return { ...base, ...ex, status: ex.text.length > 200 ? "extracted" : "failed", error: ex.text.length > 200 ? null : "Too little readable text", finalUrl: current, bytes, durationMs: Date.now() - started };
    }
    return { ...base, status: "failed", finalUrl: current, error: "Too many redirects", durationMs: Date.now() - started };
  } catch (e) {
    return { ...base, status: "failed", finalUrl: current, error: e instanceof Error ? e.message : "Retrieval failed", durationMs: Date.now() - started };
  }
}
