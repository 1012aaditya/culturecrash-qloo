/**
 * Watch dashboard numbers, computed from stored stories. Pure and deterministic, so every figure on the
 * dashboard is unit-tested. Counts use publication dates (discovery time when a source gave none), and
 * only relevant stories; copies of a story and stories grouped into one event are counted once as events.
 */

export type InsightStory = {
  id: string; targetId: string; title: string; url: string | null; publisher: string | null; provider: string;
  topic: string | null; importance: number | null; eventLead: string | null; copies: number; at: number;
};
export type InsightTarget = { id: string; name: string; role: "company" | "competitor" };

export type WatchEvent = {
  id: string; targetId: string; title: string; url: string | null; publisher: string | null; topic: string | null;
  importance: number; outlets: number; at: number;
};
export type CompanyStats = {
  targetId: string; name: string; role: "company" | "competitor";
  events30d: number; stories30d: number; share: number;
  events7d: number;
  /** Events this week against the company's normal weekly level; null without two weeks of history. */
  weekVsNormal: number | null;
  /** Events per day over the last three days against the normal daily level; set only when it's a real spike. */
  spike: { ratio: number; event: WatchEvent | null } | null;
  topics: Record<string, number>;
};
export type Dashboard = {
  days: string[];
  daily: Record<string, number[]>;
  companies: CompanyStats[];
  keyEvents: WatchEvent[];
  historyDays: number;
  labelled: number;
  total: number;
};

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Stories grouped into events (an event = its lead story and every story pointing at it). */
export function toEvents(stories: InsightStory[]): WatchEvent[] {
  const groups = new Map<string, InsightStory[]>();
  for (const s of stories) {
    const key = s.eventLead && stories.some((x) => x.id === s.eventLead) ? s.eventLead : s.id;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].map(([key, members]) => {
    const lead = members.find((m) => m.id === key) ?? members[0];
    const topics = members.map((m) => m.topic).filter(Boolean) as string[];
    const topic = lead.topic ?? (topics.length ? mode(topics) : null);
    return {
      id: key, targetId: lead.targetId, title: lead.title, url: lead.url, publisher: lead.publisher, topic,
      importance: Math.max(...members.map((m) => m.importance ?? 2)),
      outlets: members.reduce((n, m) => n + 1 + m.copies, 0),
      at: Math.min(...members.map((m) => m.at)),
    };
  });
}

function mode(list: string[]): string {
  const c = new Map<string, number>();
  for (const x of list) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** Key developments: most important first, then widest coverage, then newest. */
export function rankEvents(events: WatchEvent[]): WatchEvent[] {
  return [...events].sort((a, b) => b.importance - a.importance || b.outlets - a.outlets || b.at - a.at);
}

/**
 * Major news is reported under very different headlines ("Puma sales fall 5%", "Puma narrows loss
 * guidance", "Puma's margins improved" — all one results day), which word matching can't link. For the
 * key developments list, major events (importance 4+) about the same company with the same topic within
 * two days are shown as one, with their outlets added together and the most important, widest one leading.
 */
export function mergeMajor(events: WatchEvent[]): WatchEvent[] {
  const out: WatchEvent[] = [];
  for (const e of rankEvents(events)) {
    const same = e.importance >= 4 && e.topic && e.topic !== "other"
      ? out.find((x) => x.importance >= 4 && x.targetId === e.targetId && x.topic === e.topic && Math.abs(x.at - e.at) <= 2 * DAY)
      : undefined;
    if (same) {
      same.outlets += e.outlets;
      same.at = Math.min(same.at, e.at);
    } else out.push({ ...e });
  }
  return rankEvents(out);
}

export function buildDashboard(stories: InsightStory[], targets: InsightTarget[], opts: { now?: number; days?: number } = {}): Dashboard {
  const now = opts.now ?? Date.now();
  const span = opts.days ?? 30;
  const start = now - span * DAY;
  const inWindow = stories.filter((s) => s.at >= start && s.at <= now + DAY);
  const events = toEvents(inWindow);

  const days = Array.from({ length: span }, (_, i) => dayKey(now - (span - 1 - i) * DAY));
  const index = new Map(days.map((d, i) => [d, i]));
  const daily: Record<string, number[]> = Object.fromEntries(targets.map((t) => [t.id, days.map(() => 0)]));
  for (const e of events) {
    const i = index.get(dayKey(e.at));
    if (i !== undefined && daily[e.targetId]) daily[e.targetId][i]++;
  }

  const earliest = inWindow.length ? Math.min(...inWindow.map((s) => s.at)) : now;
  const historyDays = Math.max(1, Math.ceil((now - earliest) / DAY));
  const storiesBy = (id: string) => inWindow.filter((s) => s.targetId === id).reduce((n, s) => n + 1 + s.copies, 0);
  const totalStories = targets.reduce((n, t) => n + storiesBy(t.id), 0);

  const companies = targets.map((t): CompanyStats => {
    const mine = events.filter((e) => e.targetId === t.id);
    const series = daily[t.id];
    const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
    // "Normal" = the days before this week that we actually have history for.
    const priorDays = Math.min(historyDays, span) - 7;
    const prior = series.slice(-(7 + Math.max(priorDays, 0)), -7).reduce((a, b) => a + b, 0);
    const normalWeek = priorDays >= 7 ? (prior / priorDays) * 7 : null;
    const last3 = series.slice(-3).reduce((a, b) => a + b, 0);
    const normalDay = priorDays >= 7 ? prior / priorDays : null;
    const ratio = normalDay !== null && normalDay > 0 ? last3 / 3 / normalDay : null;
    const topEvent = rankEvents(mine.filter((e) => e.at >= now - 3 * DAY))[0] ?? null;
    const topics: Record<string, number> = {};
    for (const e of mine) if (e.topic && e.topic !== "other") topics[e.topic] = (topics[e.topic] ?? 0) + 1;
    return {
      targetId: t.id, name: t.name, role: t.role,
      events30d: mine.length, stories30d: storiesBy(t.id),
      share: totalStories ? storiesBy(t.id) / totalStories : 0,
      events7d: last7,
      weekVsNormal: normalWeek !== null && normalWeek > 0 ? last7 / normalWeek : null,
      // A spike needs at least three events in three days and twice the normal rate.
      spike: ratio !== null && ratio >= 2 && last3 >= 3 ? { ratio, event: topEvent } : null,
      topics,
    };
  });

  return {
    days, daily, companies,
    keyEvents: mergeMajor(events.filter((e) => e.at >= now - 14 * DAY)).slice(0, 8),
    historyDays,
    labelled: inWindow.filter((s) => s.topic !== null).length,
    total: inWindow.length,
  };
}
