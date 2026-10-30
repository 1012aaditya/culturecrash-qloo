import { createHash } from "node:crypto";
import { canonicalizeUrl, hostOf } from "./url";

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function contentHash(s: string): string {
  return createHash("sha256").update(normalizeText(s)).digest("hex").slice(0, 32);
}

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the this to was were will with your you our we they their".split(" "));

export function tokens(s: string): string[] {
  return normalizeText(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

/** Word 4-gram shingles (falls back to single tokens for short texts). */
export function shingles(s: string, n = 4): Set<string> {
  const t = tokens(s);
  if (t.length < n) return new Set(t);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(" "));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export type DedupeInput = { key: string; url: string | null; title: string; text: string; publisher: string | null };
export type DedupeResult = { key: string; canonicalUrl: string | null; contentHash: string; duplicateOf: string | null; group: string };

/**
 * Exact duplicates (same canonical URL or same normalised content) are marked duplicate_of
 * the first occurrence and dropped. Near-duplicates (syndicated copies, rewrites of one press
 * release: high shingle overlap or identical normalised titles on different hosts) are kept
 * but share an independence group, so they count as ONE source for corroboration.
 */
export function dedupe(items: DedupeInput[], nearThreshold = 0.6): DedupeResult[] {
  const out: DedupeResult[] = [];
  const byUrl = new Map<string, string>();
  const byHash = new Map<string, string>();
  const seen: { key: string; sh: Set<string>; title: string; group: string; host: string | null }[] = [];
  let g = 0;
  for (const it of items) {
    const canonicalUrl = canonicalizeUrl(it.url);
    const hash = contentHash(`${it.title}\n${it.text}`);
    const dupOf = (canonicalUrl && byUrl.get(canonicalUrl)) || byHash.get(hash) || null;
    if (dupOf) {
      const first = out.find((o) => o.key === dupOf)!;
      out.push({ key: it.key, canonicalUrl, contentHash: hash, duplicateOf: dupOf, group: first.group });
      continue;
    }
    const sh = shingles(it.text);
    const title = normalizeText(it.title);
    const host = hostOf(canonicalUrl);
    const near = seen.find((s) => (sh.size >= 8 && jaccard(s.sh, sh) >= nearThreshold) || (title.length > 24 && s.title === title && s.host !== host));
    const group = near ? near.group : `g${++g}`;
    if (canonicalUrl) byUrl.set(canonicalUrl, it.key);
    byHash.set(hash, it.key);
    seen.push({ key: it.key, sh, title, group, host });
    out.push({ key: it.key, canonicalUrl, contentHash: hash, duplicateOf: null, group });
  }
  return out;
}

/** Merge near-identical claims, keeping every supporting document (independent corroboration survives). */
export function mergeClaims<T extends { text: string; documentIds: string[] }>(claims: T[], threshold = 0.72): (T & { mergedFrom: number })[] {
  const out: (T & { mergedFrom: number; _t: Set<string> })[] = [];
  for (const c of claims) {
    const t = new Set(tokens(c.text));
    const hit = out.find((o) => jaccard(o._t, t) >= threshold);
    if (hit) {
      hit.documentIds = [...new Set([...hit.documentIds, ...c.documentIds])];
      hit.mergedFrom++;
    } else {
      out.push({ ...c, documentIds: [...c.documentIds], mergedFrom: 1, _t: t });
    }
  }
  return out.map(({ _t, ...rest }) => { void _t; return rest as T & { mergedFrom: number }; });
}

/** Distinct independence groups among a claim's supporting documents. */
export function independentCount(documentIds: string[], groupOf: (id: string) => string | null | undefined): number {
  return new Set(documentIds.map((id) => groupOf(id) ?? id)).size;
}

/** Near-duplicate query check, so follow-up rounds don't repeat themselves. */
export function isRepeatQuery(q: string, previous: string[], threshold = 0.75): boolean {
  const t = new Set(tokens(q));
  return previous.some((p) => jaccard(new Set(tokens(p)), t) >= threshold);
}

/**
 * Takes up to `n` items in turns across questions (by each item's first question key), keeping each
 * question's own order. Taking the first `n` let the first question use the whole extraction cap: live,
 * q1 got all 18 documents and q2–q5 got no claims despite 15–30 documents each.
 */
export function takeAcrossQuestions<T extends { questionKeys: string[] }>(items: T[], n: number): T[] {
  const queues = new Map<string, T[]>();
  for (const it of items) {
    const k = it.questionKeys[0] ?? "";
    queues.set(k, [...(queues.get(k) ?? []), it]);
  }
  const out: T[] = [];
  while (out.length < n && [...queues.values()].some((q) => q.length)) {
    for (const q of queues.values()) {
      const next = q.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return out;
}
