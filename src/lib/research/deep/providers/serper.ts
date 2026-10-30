import type { Hit, ProviderCall } from "../types";
import { decodeEntities, isoOrNull, requestJson, str, type Fetcher } from "./http";

/**
 * Serper.dev — Real-time Google Search API.
 * Provides live Google Search organic results, news, peopleAlsoAsk, and related queries.
 */
export async function serperSearch(opts: {
  query: string;
  count?: number;
  country?: string | null;
  apiKey: string;
  usdPerCall?: number;
  fetcher?: Fetcher;
}): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 400);
  const num = Math.min(opts.count ?? 8, 15);
  const gl = opts.country && /^[a-z]{2}$/i.test(opts.country) ? opts.country.toLowerCase() : undefined;

  return requestJson<Hit[]>({
    url: "https://google.serper.dev/search",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": opts.apiKey,
      },
      body: JSON.stringify({
        q,
        num,
        ...(gl ? { gl } : {}),
      }),
    },
    params: { q, num: String(num), ...(gl ? { gl } : {}) },
    fallback: [],
    usdPerCall: opts.usdPerCall ?? 0.001,
    fetcher: opts.fetcher,
    parse: (body) => {
      const data = body as {
        organic?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
          date?: string;
          position?: number;
        }>;
      };

      const organic = data.organic ?? [];
      return organic.flatMap((item): Hit[] => {
        const title = str(item.title);
        const url = str(item.link);
        if (!title || !url) return [];

        const publisher = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return "Google";
          }
        })();

        return [{
          provider: "serper",
          sourceType: "web_page",
          url,
          externalId: null,
          title: decodeEntities(title),
          snippet: decodeEntities(str(item.snippet) ?? "").slice(0, 1500),
          publisher,
          publishedAt: isoOrNull(item.date),
          language: null,
          metrics: { position: item.position ?? 0 },
          usageRestrictions: null,
        }];
      });
    },
    empty: (d) => d.length === 0,
  });
}

const UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };

/**
 * Serper's news results carry dates like "5 hours ago" or "Oct 28, 2026". A relative date becomes an
 * approximate timestamp counted back from `now`; a calendar date is precise to the day. Anything else
 * is left unknown — a publication time is never guessed.
 */
export function parseNewsDate(raw: string | null | undefined, now = Date.now()): { at: string; precision: "day" | "approximate" } | null {
  const s = raw?.trim().toLowerCase();
  if (!s) return null;
  const rel = s.match(/^(\d+)\s+(minute|hour|day|week|month)s?\s+ago$/);
  if (rel) return { at: new Date(now - Number(rel[1]) * UNIT_MS[rel[2]]).toISOString(), precision: "approximate" };
  if (s === "yesterday") return { at: new Date(now - UNIT_MS.day).toISOString(), precision: "approximate" };
  const d = new Date(raw!);
  return Number.isNaN(d.getTime()) || !/\d{4}/.test(s) ? null : { at: d.toISOString(), precision: "day" };
}

/**
 * Serper Google News search, limited to a recent window ("d" = past day, "w" = past week) — the
 * source Watch uses for press coverage, announcements and launches.
 */
export async function serperNews(opts: {
  query: string;
  window: "d" | "w";
  count?: number;
  /** Results page (1-based); page 2 holds results 11–20. */
  page?: number;
  country?: string | null;
  apiKey: string;
  usdPerCall?: number;
  fetcher?: Fetcher;
  now?: number;
}): Promise<ProviderCall<Hit[]>> {
  const q = opts.query.slice(0, 400);
  const num = Math.min(opts.count ?? 10, 20);
  const gl = opts.country && /^[a-z]{2}$/i.test(opts.country) ? opts.country.toLowerCase() : undefined;
  const tbs = `qdr:${opts.window}`;
  const page = opts.page && opts.page > 1 ? opts.page : undefined;
  return requestJson<Hit[]>({
    url: "https://google.serper.dev/news",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": opts.apiKey },
      body: JSON.stringify({ q, num, tbs, ...(gl ? { gl } : {}), ...(page ? { page } : {}) }),
    },
    params: { q, num: String(num), tbs, ...(gl ? { gl } : {}), ...(page ? { page: String(page) } : {}) },
    fallback: [],
    usdPerCall: opts.usdPerCall ?? 0.001,
    fetcher: opts.fetcher,
    parse: (body) => ((body as { news?: unknown[] }).news ?? []).flatMap((n): Hit[] => {
      const o = n as Record<string, unknown>;
      const title = str(o.title);
      const url = str(o.link);
      if (!title || !url) return [];
      const date = parseNewsDate(str(o.date), opts.now);
      return [{
        provider: "serper", sourceType: "news", url, externalId: null,
        title: decodeEntities(title), snippet: decodeEntities(str(o.snippet) ?? "").slice(0, 1500),
        publisher: str(o.source), publishedAt: date?.at ?? null, publishedPrecision: date?.precision,
        language: null, metrics: {}, usageRestrictions: null,
      }];
    }),
    empty: (d) => d.length === 0,
  });
}
