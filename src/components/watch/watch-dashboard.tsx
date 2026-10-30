"use client";

import { ArrowDownRight, ArrowUpRight, ExternalLink, History, Minus, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Ago } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { loadHistoryAction } from "@/lib/watch/actions";
import type { WatchView } from "@/lib/watch/data";
import type { CompanyStats, WatchEvent } from "@/lib/watch/insights";
import { cn, formatDate } from "@/lib/utils";

/** The client in brand violet; competitors in two clearly different hues, each with its own line style too. */
const SERIES = [
  { color: "#8064f5", dash: undefined },
  { color: "#e8743b", dash: "6 4" },
  { color: "#1f9e8a", dash: "2 4" },
];

export const TOPIC_LABEL: Record<string, string> = {
  launch: "Launch", collaboration: "Collab", marketing: "Marketing", financial: "Financial", leadership: "Leadership",
  retail: "Retail", sustainability: "Sustainability", legal: "Legal", other: "Other",
};
const TOPIC_COLOR: Record<string, string> = {
  launch: "#5b3fd6", collaboration: "#e8743b", marketing: "#c2417a", financial: "#1f9e8a", leadership: "#b7791f",
  retail: "#3d7fd9", sustainability: "#2f8f6b", legal: "#c2412d",
};

export function TopicBadge({ topic }: { topic: string | null }) {
  if (!topic || topic === "other") return null;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${TOPIC_COLOR[topic]}1a`, color: TOPIC_COLOR[topic] }}>
      {TOPIC_LABEL[topic]}
    </span>
  );
}

export function WatchDashboard({ view, canEdit }: { view: WatchView; canEdit: boolean }) {
  const d = view.dashboard;
  if (!view.watch || !d) return null;
  const companies = d.companies;
  const client = companies.find((c) => c.role === "company") ?? companies[0];
  const colorOf = (targetId: string) => SERIES[Math.max(0, companies.findIndex((c) => c.targetId === targetId))] ?? SERIES[0];
  const top = d.keyEvents[0] ?? null;
  const spikes = companies.filter((c) => c.spike).sort((a, b) => b.spike!.ratio - a.spike!.ratio);

  return (
    <div className="space-y-6">
      <HistoryNote view={view} canEdit={canEdit} />

      <section aria-label="Headline numbers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={`${client?.name ?? "Client"} share of voice`} value={client ? `${Math.round(client.share * 100)}%` : "—"}
          sub={`of coverage vs ${companies.filter((c) => c !== client).map((c) => c.name).join(" and ")}, 30 days`} />
        <Tile label="Events this week" value={String(companies.reduce((n, c) => n + c.events7d, 0))}
          sub={<WeekTrend c={client} />} />
        <Tile label="Biggest story, last 14 days" value={top ? companies.find((c) => c.targetId === top.targetId)?.name ?? "—" : "—"} small
          sub={top ? `${top.title.slice(0, 70)}${top.title.length > 70 ? "…" : ""} · ${top.outlets} ${top.outlets === 1 ? "outlet" : "outlets"}` : "No stories yet"} />
        <Tile label="Coverage spikes" value={spikes.length ? `${spikes[0].name} · ${spikes[0].spike!.ratio.toFixed(1)}×` : "None"} small
          sub={spikes.length ? (spikes[0].spike!.event?.title.slice(0, 70) ?? "Above its normal level") : d.historyDays >= 14 ? "Everyone is at their normal level" : "Needs two weeks of history"} />
      </section>

      <Card title="Coverage per day" note="Distinct news events by publication date. Copies and follow-ups of the same story count once.">
        <Legend companies={companies} />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.days.map((day, i) => ({ day, ...Object.fromEntries(companies.map((c) => [c.name, d.daily[c.targetId]?.[i] ?? 0])) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#eeeae6" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(v: string) => formatDate(v, { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: "#8d8a96" }} tickLine={false} axisLine={{ stroke: "#d9d3cc" }} minTickGap={28} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8d8a96" }} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={(v) => formatDate(String(v), { day: "numeric", month: "short", year: "numeric" })} contentStyle={{ borderRadius: 12, border: "1px solid #e9e5e1", fontSize: 12 }} />
              {companies.map((c) => (
                <Line key={c.targetId} type="monotone" dataKey={c.name} stroke={colorOf(c.targetId).color} strokeDasharray={colorOf(c.targetId).dash} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Share of voice" note="Share of all stories in the last 30 days.">
          <div className="flex items-center gap-4">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={companies.map((c) => ({ name: c.name, value: c.stories30d, id: c.targetId }))} dataKey="value" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                    {companies.map((c) => <Cell key={c.targetId} fill={colorOf(c.targetId).color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9e5e1", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2.5 text-[13px]">
              {companies.map((c) => (
                <li key={c.targetId} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: colorOf(c.targetId).color }} />
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums text-muted">{Math.round(c.share * 100)}% · {c.stories30d} stories</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="What they're in the news for" note={`Share of each company's news events by topic${d.labelled < d.total ? ` (${d.labelled} of ${d.total} stories labelled so far)` : ""}.`}>
          <TopicMix companies={companies} />
        </Card>
      </div>

      <Card title="Key developments" note="The last 14 days, most important first. Importance is judged by AI from the story; coverage counts every outlet that reported it.">
        {d.keyEvents.length ? (
          <ol className="divide-y divide-line">
            {d.keyEvents.map((e, i) => <EventRow key={e.id} e={e} rank={i + 1} company={companies.find((c) => c.targetId === e.targetId)} color={colorOf(e.targetId).color} />)}
          </ol>
        ) : <p className="py-6 text-center text-[13px] text-muted">No stories in the last 14 days yet.</p>}
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, small }: { label: string; value: string; sub: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-cc-lg border border-line bg-paper p-5">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn("mt-1.5 font-semibold tracking-tight tabular-nums", small ? "text-[18px] leading-snug" : "text-[30px] leading-none")}>{value}</p>
      <div className="mt-2 text-[12px] leading-snug text-muted">{sub}</div>
    </div>
  );
}

function WeekTrend({ c }: { c: CompanyStats | undefined }) {
  if (!c) return null;
  if (c.weekVsNormal === null) return <span>{c.name}: {c.events7d} · needs two weeks of history to compare</span>;
  const pct = Math.round((c.weekVsNormal - 1) * 100);
  const Icon = pct > 5 ? ArrowUpRight : pct < -5 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1", pct > 5 ? "text-success" : pct < -5 ? "text-danger" : "")}>
      <Icon className="size-3.5" /> {c.name} {pct > 0 ? "+" : ""}{pct}% vs its normal week
    </span>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-cc-lg border border-line bg-paper p-5" aria-label={title}>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Legend({ companies }: { companies: CompanyStats[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-muted">
      {companies.map((c, i) => (
        <span key={c.targetId} className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={SERIES[i]?.color} strokeWidth="2" strokeDasharray={SERIES[i]?.dash} /></svg>
          {c.name}{c.role === "company" ? " (client)" : ""}
        </span>
      ))}
    </div>
  );
}

function TopicMix({ companies }: { companies: CompanyStats[] }) {
  const topics = Object.keys(TOPIC_COLOR).filter((t) => companies.some((c) => c.topics[t]));
  if (!topics.length) return <p className="py-6 text-center text-[13px] text-muted">Topics appear once stories have been labelled.</p>;
  const data = companies.map((c) => {
    const total = Object.values(c.topics).reduce((a, b) => a + b, 0) || 1;
    return { name: c.name, ...Object.fromEntries(topics.map((t) => [t, Math.round(((c.topics[t] ?? 0) / total) * 100)])) };
  });
  return (
    <>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }} barCategoryGap={10}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#111116" }} tickLine={false} axisLine={false} width={70} />
            <Tooltip formatter={(v, name) => [`${v}%`, TOPIC_LABEL[String(name)] ?? name]} contentStyle={{ borderRadius: 12, border: "1px solid #e9e5e1", fontSize: 12 }} />
            {topics.map((t, i) => <Bar key={t} dataKey={t} stackId="t" fill={TOPIC_COLOR[t]} stroke="#fff" strokeWidth={1.5} radius={i === topics.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        {topics.map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: TOPIC_COLOR[t] }} />{TOPIC_LABEL[t]}</span>)}
      </div>
    </>
  );
}

function EventRow({ e, rank, company, color }: { e: WatchEvent; rank: number; company: CompanyStats | undefined; color: string }) {
  return (
    <li className="flex items-start gap-4 py-3.5">
      <span className="w-5 shrink-0 pt-0.5 text-right text-[13px] tabular-nums text-faint">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink"><span className="size-2 rounded-full" style={{ background: color }} />{company?.name}</span>
          <TopicBadge topic={e.topic} />
          <span>{formatDate(new Date(e.at))}</span>
        </div>
        <p className="mt-1 text-[14px] font-medium leading-snug">
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1.5 hover:text-violet-ink">
              {e.title} <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
            </a>
          ) : e.title}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{e.publisher ?? "Unknown publisher"}{e.outlets > 1 && ` and ${e.outlets - 1} more ${e.outlets - 1 === 1 ? "outlet" : "outlets"}`}</p>
      </div>
      <Importance value={e.importance} />
    </li>
  );
}

function Importance({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 pt-1" role="img" aria-label={`Importance ${value} of 5`} title={`Importance ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("h-3 w-1.5 rounded-sm", i <= value ? "bg-violet" : "bg-line")} />)}
    </span>
  );
}

/** How much history the charts rest on, and the one-off 30-day load. */
function HistoryNote({ view, canEdit }: { view: WatchView; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const h = view.history;
  const d = view.dashboard!;
  const loading = h?.status === "running" || (h?.status === "queued" && pending);
  if (h?.status === "completed" || h?.status === "partially_completed") {
    return <p className="flex items-center gap-1.5 text-[12px] text-muted"><History className="size-3.5" /> Based on {d.total} stories over the last {Math.min(d.historyDays, 30)} days, including the 30-day history loaded <Ago value={h.finishedAt} />.</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-cc-lg border border-violet/25 bg-lilac/30 px-5 py-3.5 text-[13px]">
      <p className="flex items-center gap-2">
        <TrendingUp className="size-4 text-violet" />
        {loading ? "Loading the last 30 days of news… the charts fill in within a couple of minutes." : `Charts use ${d.historyDays} ${d.historyDays === 1 ? "day" : "days"} of data so far. Load the last 30 days to see trends now.`}
      </p>
      {canEdit && !loading && (
        <Button size="sm" variant="accent" disabled={pending} onClick={() => start(async () => {
          const r = await loadHistoryAction(view.client.id);
          toast(r.ok ? { tone: "success", title: "Loading history", description: r.message } : { tone: "error", title: r.error });
          router.refresh();
        })}>
          <History /> Load last 30 days
        </Button>
      )}
    </div>
  );
}
