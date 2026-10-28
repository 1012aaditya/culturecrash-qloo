"use client";

import Link from "next/link";
import { LayoutGrid, List, Plus, Search, SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { currentStage, stageStates, type ProjectSummary } from "@/lib/progress";
import { STAGES } from "@/lib/stages";
import { cn, timeAgo } from "@/lib/utils";
import { ProjectActions } from "./project-actions";
import { StageDots } from "./stage-dots";

type Props = { projects: ProjectSummary[]; canCreate: boolean; canEdit: boolean; canDeleteAny: boolean; userId: string };

const spans = ["md:col-span-7 md:row-span-2 min-h-[440px]", "md:col-span-5 min-h-[210px]", "md:col-span-5 min-h-[210px]", "md:col-span-4 min-h-[300px]", "md:col-span-4 min-h-[300px]", "md:col-span-4 min-h-[300px]", "md:col-span-6 min-h-[260px]", "md:col-span-6 min-h-[260px]"];

function runLabel(p: ProjectSummary) {
  if (!p.lastRunStatus) return null;
  const mode = p.lastRunMode === "demo" ? " (demo)" : "";
  return { queued: "Research queued", running: "Research running", completed: "Research complete", failed: "Research failed" }[p.lastRunStatus] + mode;
}

export function ProjectLibrary({ projects, canCreate, canEdit, canDeleteAny, userId }: Props) {
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"gallery" | "list">("gallery");
  const [client, setClient] = React.useState("");
  const [status, setStatus] = React.useState("open");
  const [category, setCategory] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [since, setSince] = React.useState("");
  const [sort, setSort] = React.useState<"updated" | "name">("updated");

  React.useEffect(() => {
    try {
      const v = localStorage.getItem("cc:library-view");
      if (v === "list" || v === "gallery") setView(v);
    } catch {}
  }, []);
  const setViewPersist = (v: "gallery" | "list") => {
    setView(v);
    try { localStorage.setItem("cc:library-view", v); } catch {}
  };

  const clients = [...new Map(projects.filter((p) => p.clientId).map((p) => [p.clientId!, p.clientName!])).entries()];
  const categories = [...new Set(projects.map((p) => p.category).filter(Boolean) as string[])].sort();
  const owners = [...new Map(projects.filter((p) => p.ownerId).map((p) => [p.ownerId!, p.ownerName ?? "Unknown"])).entries()];

  const filtered = projects
    .filter((p) => (status === "open" ? p.status !== "archived" : status === "all" ? true : p.status === status))
    .filter((p) => !client || p.clientId === client)
    .filter((p) => !category || p.category === category)
    .filter((p) => !owner || p.ownerId === owner)
    .filter((p) => !since || Date.now() - new Date(p.updatedAt).getTime() <= Number(since) * 86400000)
    .filter((p) => {
      const t = q.trim().toLowerCase();
      return !t || [p.name, p.clientName, p.category, p.market].some((v) => v?.toLowerCase().includes(t));
    })
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));

  const activeFilters = [client, category, owner, since].filter(Boolean).length + (status !== "open" ? 1 : 0);

  if (projects.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="relative min-h-[360px] overflow-hidden rounded-[32px] bg-charcoal p-10 text-white">
          <ArtPlate theme="culture" seed="empty-library" rounded={false} className="absolute inset-0 opacity-60" />
          <div className="relative max-w-md">
            <p className="cc-eyebrow text-white/60">Your library is empty</p>
            <h2 className="cc-display mt-4 text-5xl">Start with a brief.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Create a campaign, describe the brand, audience and objective, and CultureCrash will plan research against
              the cultural data that is actually available.
            </p>
            {canCreate && <Button asChild variant="inverse" className="mt-8"><Link href="/projects/new"><Plus /> Create campaign</Link></Button>}
          </div>
        </div>
        <EmptyState title="What happens next" body={<ol className="list-decimal space-y-1.5 pl-4"><li>Write or upload the brief.</li><li>Run cultural research.</li><li>Review evidence and opportunities.</li><li>Generate and compare positioning directions.</li><li>Plan experiments and export a report.</li></ol>} />
      </div>
    );
  }

  return (
    <div>
      <div className="cc-glass sticky top-[76px] z-20 flex flex-wrap items-center gap-2 rounded-cc-lg p-2">
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-white/80 px-3.5">
          <Search className="size-4 text-muted" />
          <span className="sr-only">Search projects</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns, clients, markets" className="h-full flex-1 bg-transparent text-[13px] outline-none" />
        </label>
        <details className="group relative">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-white/80 px-3.5 text-[13px] hover:bg-white">
            <SlidersHorizontal className="size-4" /> Filters {activeFilters > 0 && <Badge tone="violet">{activeFilters}</Badge>}
          </summary>
          <div className="absolute left-0 top-12 z-30 grid w-[min(92vw,560px)] gap-3 rounded-cc-lg border border-line bg-paper p-4 shadow-float sm:grid-cols-2">
            <label className="text-[12px] text-muted">Client
              <Select value={client} onChange={(e) => setClient(e.target.value)} className="mt-1"><option value="">All clients</option>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
            </label>
            <label className="text-[12px] text-muted">Status
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1"><option value="open">Active & draft</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="all">All</option></Select>
            </label>
            <label className="text-[12px] text-muted">Category
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1"><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
            </label>
            <label className="text-[12px] text-muted">Owner
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="mt-1"><option value="">Anyone</option>{owners.map(([id, name]) => <option key={id} value={id}>{id === userId ? "Me" : name}</option>)}</Select>
            </label>
            <label className="text-[12px] text-muted">Updated
              <Select value={since} onChange={(e) => setSince(e.target.value)} className="mt-1"><option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>
            </label>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => { setClient(""); setCategory(""); setOwner(""); setSince(""); setStatus("open"); }}>Reset filters</Button>
            </div>
          </div>
        </details>
        <Select value={sort} onChange={(e) => setSort(e.target.value as "updated" | "name")} className="h-10 w-auto rounded-full" aria-label="Sort">
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
        </Select>
        <div className="flex rounded-full border border-line bg-white/80 p-0.5" role="group" aria-label="View">
          <button onClick={() => setViewPersist("gallery")} aria-pressed={view === "gallery"} className={cn("inline-flex size-9 items-center justify-center rounded-full", view === "gallery" && "bg-ink text-white")} aria-label="Gallery view"><LayoutGrid className="size-4" /></button>
          <button onClick={() => setViewPersist("list")} aria-pressed={view === "list"} className={cn("inline-flex size-9 items-center justify-center rounded-full", view === "list" && "bg-ink text-white")} aria-label="List view"><List className="size-4" /></button>
        </div>
      </div>

      <p className="mt-4 text-[12px] text-muted" aria-live="polite">{filtered.length} of {projects.length} campaigns</p>

      {filtered.length === 0 ? (
        <EmptyState className="mt-4" title="No campaigns match" body="Try a different search or reset the filters." />
      ) : view === "gallery" ? (
        <ul className="mt-4 grid auto-rows-auto gap-4 md:grid-cols-12">
          {filtered.map((p, i) => {
            const states = stageStates(p);
            const stage = STAGES.find((s) => s.key === currentStage(p))!;
            const big = i % 8 === 0;
            return (
              <li key={p.id} className={cn("group relative overflow-hidden rounded-[28px] bg-charcoal text-white shadow-card", spans[i % spans.length])}>
                <ArtPlate theme={themeForCategory(p.category)} seed={p.id} rounded={false} className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/20 to-transparent" />
                <Link href={`/projects/${p.id}`} className="absolute inset-0 z-[1]" aria-label={`Open ${p.name}`} />
                <div className="pointer-events-none relative z-[2] flex h-full flex-col justify-between p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="glass">{stage.number} {stage.label}</Badge>
                      {p.status === "archived" && <Badge tone="glass">Archived</Badge>}
                      {p.isDemo && <DemoBadge label="Demo" />}
                    </div>
                    <div className="pointer-events-auto"><ProjectActions project={p} canEdit={canEdit} canDelete={canDeleteAny || p.ownerId === userId} dark /></div>
                  </div>
                  <div>
                    <p className="cc-eyebrow text-[10px] text-white/60">{p.clientName ?? "No client"}{p.market ? ` · ${p.market}` : ""}</p>
                    <h3 className={cn("cc-display mt-2", big ? "text-5xl md:text-6xl" : "text-3xl")}>{p.name}</h3>
                    {p.category && <p className="mt-1 text-[13px] text-white/70">{p.category}</p>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3 text-[11px] text-white/65">
                      <StageDots states={states} dark />
                      <span>{runLabel(p) ?? "No research yet"} · {timeAgo(p.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-cc-lg border border-line bg-paper">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Research</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 font-medium">Updated</th><th className="w-12" /></tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-ivory/60">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-violet">{p.name}</Link>
                    <div className="text-[12px] text-muted">{[p.category, p.market].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-3"><StageDots states={stageStates(p)} /></td>
                  <td className="px-4 py-3 text-muted">{runLabel(p) ?? "—"}{p.isDemo && <DemoBadge className="ml-2" label="Demo" />}</td>
                  <td className="px-4 py-3 text-muted">{p.ownerId === userId ? "You" : p.ownerName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{timeAgo(p.updatedAt)}</td>
                  <td className="px-2"><ProjectActions project={p} canEdit={canEdit} canDelete={canDeleteAny || p.ownerId === userId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
