"use client";

import { Ago, When } from "@/components/ui/time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, FileText, FlaskConical, History, Info, List, Loader2, Network, Play, RotateCw, Search, X } from "lucide-react";
import * as React from "react";
import { EntityImage } from "@/components/art/entity-image";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { StageRail, type StageInfo } from "@/components/nav/stage-nav";
import { DemoBadge, EmptyState, ErrorNotice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CopilotMessage } from "@/lib/ai/copilot-actions";
import type { EntityRow, RelRow, RunRow, SourceRow } from "@/lib/data/research";
import { startResearchAction } from "@/lib/research/actions";
import type { StageKey } from "@/lib/stages";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { CulturalNetwork, TYPE_LABEL, TYPE_THEME } from "./cultural-network";
import { ResearchLauncher } from "./deep/research-launcher";
import { ResearchProgress, ResearchReport } from "./deep/research-report";
import type { ClaimRow, DeepView, ProviderStatus } from "@/lib/research/deep/view-types";

type Props = {
  project: { id: string; name: string; category: string | null; market: string | null; isDemo: boolean; description: string };
  theme: PlateTheme;
  stages: Record<StageKey, StageInfo>;
  run: RunRow | null;
  runs: RunRow[];
  entities: EntityRow[];
  relationships: RelRow[];
  sources: SourceRow[];
  plan: { question: string; seeds: string[]; location: string | null; targets: string[]; notes: string[] };
  featured: { id: string; title: string; description: string; isDemo: boolean; generator: string; evidenceCount: number } | null;
  opportunityCount: number;
  canRun: boolean;
  demoAllowed: boolean;
  qlooConfigured: boolean;
  llm: boolean;
  generatorLabel: string | null;
  copilot: { conversationId: string | null; messages: CopilotMessage[] };
  deep: DeepView | null;
  providers: ProviderStatus[];
  webEnabled: boolean;
  user: { name: string; workspace: string };
};

function useRunWatcher(projectId: string, run: RunRow | null) {
  const router = useRouter();
  const [live, setLive] = React.useState<{ status: string; calls: number; stage: string | null; documents: number; claims: number; failedCalls: number } | null>(null);
  React.useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    let stop = false;
    let polls = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/runs/${run.id}`, { cache: "no-store" });
        if (res.ok) {
          const { run: r } = await res.json();
          setLive({ status: r.status, calls: r.calls, stage: r.stage, documents: r.documents, claims: r.claims, failedCalls: r.failed_calls });
          if (!["queued", "running"].includes(r.status)) {
            router.refresh();
            return;
          }
        }
      } catch {}
      // Poll briskly at first, then ease off: long runs don't need a request every 2 seconds.
      polls++;
      if (!stop) setTimeout(tick, polls < 20 ? 1800 : 5000);
    };
    const t = setTimeout(tick, 1200);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [projectId, run, router]);
  return live;
}

export function ResearchWorkspace(p: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"report" | "network" | "list">(p.deep ? "report" : "network");
  // Switching to a different run opens its report when it has one.
  const [viewRun, setViewRun] = React.useState(p.run?.id ?? null);
  if ((p.run?.id ?? null) !== viewRun) {
    setViewRun(p.run?.id ?? null);
    setView(p.deep ? "report" : "network");
  }
  const [types, setTypes] = React.useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = React.useState<"all" | "white_space" | "subcultural_orbit" | "consensus" | "competitor_stronghold">("all");
  const [query, setQuery] = React.useState("");
  const [starting, setStarting] = React.useState<"live" | "demo" | null>(null);
  const keyRef = React.useRef<Record<string, string>>({});
  const live = useRunWatcher(p.project.id, p.run);
  const runActive = p.run?.status === "queued" || p.run?.status === "running";

  const presentTypes = [...new Set(p.entities.filter((e) => e.role !== "seed").map((e) => (e.role === "tag" ? "tag" : e.type)))];
  const selectedEntity = p.entities.find((e) => e.id === selected) ?? null;
  const observations = p.entities.filter((e) => e.role !== "seed");
  const isDemoRun = p.run?.mode === "demo";

  async function start(mode: "live" | "demo") {
    if (starting) return;
    keyRef.current[mode] ??= crypto.randomUUID();
    setStarting(mode);
    let res: Awaited<ReturnType<typeof startResearchAction>>;
    try {
      // Demo runs and retries use the multi-source pipeline (Qloo + web + documents) at the previous or standard depth.
      res = await startResearchAction({ projectId: p.project.id, mode, idempotencyKey: keyRef.current[mode], depth: p.run?.depth ?? "standard", question: p.deep?.question ?? null });
    } catch {
      res = { ok: false, error: "The request failed. Check your connection and try again." };
    } finally {
      setStarting(null);
      delete keyRef.current[mode];
    }
    if (!res.ok && res.activeRunId) {
      toast({ tone: "info", title: "A research run is already in progress", description: "Showing it now. Start another once it finishes, or cancel it." });
      router.push(`/projects/${p.project.id}/research?run=${res.activeRunId}`);
      return router.refresh();
    }
    if (!res.ok) return toast({ tone: "error", title: "Research not started", description: res.error });
    toast({ tone: "success", title: res.reused ? "A research run is already in progress" : mode === "demo" ? "Demonstration run started" : "Research run started" });
    router.push(`/projects/${p.project.id}/research?run=${res.runId}`);
    router.refresh();
  }

  const toggleType = (t: string) => setTypes((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t); else n.add(t);
    return n;
  });

  const runControls = p.canRun && (
    <div className="flex flex-wrap items-center gap-2">
      <ResearchLauncher projectId={p.project.id} providers={p.providers} qlooConfigured={p.qlooConfigured} webEnabled={p.webEnabled} disabled={!!starting || runActive} label={p.run ? "Run again" : "Start research"} />
      {p.demoAllowed && (
        <Button size="sm" variant="outline" onClick={() => start("demo")} disabled={!!starting || runActive}>
          {starting === "demo" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Demo run
        </Button>
      )}
    </div>
  );

  const failedNotice = p.run && (
    <ErrorNotice className="max-w-lg bg-paper" title="This research run failed" body={<><p>{p.run.errorMessage}</p><p className="mt-2">No fixture data was substituted. {p.run.failedCalls > 0 && `${p.run.failedCalls} provider request(s) failed — see the run history for details.`}</p></>}>
      {p.canRun && <Button size="sm" onClick={() => start("live")} disabled={!!starting || (!p.run.depth && !p.qlooConfigured)}><RotateCw /> Retry live research</Button>}
      {p.canRun && p.demoAllowed && <Button size="sm" variant="outline" onClick={() => start("demo")} disabled={!!starting}><FlaskConical /> Run a separate demonstration</Button>}
      <Button size="sm" variant="ghost" asChild><Link href={`/projects/${p.project.id}/research/history`}>Run history</Link></Button>
    </ErrorNotice>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_400px]">
      {/* Immersive project identity + stage treatment (contextual to this screen, not app navigation) */}
      <aside className="relative hidden min-h-[860px] overflow-hidden rounded-[36px] bg-charcoal text-white xl:block" aria-label="Project">
        <ArtPlate theme={p.theme} seed={p.project.id} rounded={false} className="absolute inset-0 opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/10 to-charcoal/85" />
        <div className="relative flex h-full flex-col justify-between p-6">
          <div className="pt-20">
            <p className="cc-eyebrow text-[10px] text-white/70">Project</p>
            <h2 className="cc-display mt-2 text-5xl leading-[0.92]">{p.project.name}</h2>
            <p className="mt-3 text-[14px] leading-snug text-white/80">{p.project.description}</p>
          </div>
          <div className="rounded-[28px] bg-charcoal/70 p-3 backdrop-blur-md">
            <StageRail projectId={p.project.id} stages={p.stages} />
          </div>
          <div className="flex items-center justify-between text-[12px] text-white/75">
            <span><b className="block font-medium text-white">{p.user.name}</b>{p.user.workspace}</span>
            <Link href={`/projects/${p.project.id}/research/history`} className="flex items-center gap-1 hover:text-white"><History className="size-3.5" /> History</Link>
          </div>
        </div>
      </aside>

      {/* Central research canvas */}
      <section className="relative flex flex-col overflow-hidden rounded-[36px] border border-line bg-[radial-gradient(70%_60%_at_55%_55%,rgba(255,199,177,0.18),transparent_70%),radial-gradient(50%_50%_at_45%_45%,rgba(184,165,255,0.2),transparent_70%)] bg-paper/70" aria-label="Cultural research canvas">
        <div className="relative z-10 flex flex-col gap-5 p-6 md:p-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <p className="cc-eyebrow text-muted">Cultural intelligence</p>
            <h1 className="cc-display mt-3 text-5xl md:text-[58px]">See the bigger cultural picture.</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">The brands, music, places and ideas returned for this brief’s signal — and how strongly they correlate with it.</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex rounded-full border border-line bg-white/80 p-1" role="group" aria-label="Canvas view">
              {p.deep && <button onClick={() => setView("report")} aria-pressed={view === "report"} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]", view === "report" ? "bg-violet text-white" : "text-muted hover:text-ink")}><FileText className="size-3.5" /> Report</button>}
              <button onClick={() => setView("network")} aria-pressed={view === "network"} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]", view === "network" ? "bg-violet text-white" : "text-muted hover:text-ink")}><Network className="size-3.5" /> Network view</button>
              <button onClick={() => setView("list")} aria-pressed={view === "list"} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]", view === "list" ? "bg-violet text-white" : "text-muted hover:text-ink")}><List className="size-3.5" /> List view</button>
            </div>
            {runControls}
            {p.run && (
              <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted" role="status" aria-live="polite">
                {isDemoRun && <DemoBadge />}
                {runActive ? <span className="inline-flex items-center gap-1.5 text-violet"><Loader2 className="size-3 animate-spin" /> {live?.status ?? p.run.status} · {live?.calls ?? p.run.callCount} provider requests</span> : <span>Run {p.run.status} · <Ago value={p.run.completedAt ?? p.run.createdAt} /></span>}
                {p.runs.length > 1 && <Link href={`/projects/${p.project.id}/research/history`} className="underline-offset-2 hover:underline">{p.runs.length} runs</Link>}
              </p>
            )}
          </div>
        </div>

        {observations.length > 0 && view !== "report" && (
          <div className="relative z-10 flex flex-wrap items-center gap-2 px-6 md:px-8">
            <label className="flex h-9 items-center gap-2 rounded-full border border-line bg-white/85 px-3">
              <Search className="size-3.5 text-muted" />
              <span className="sr-only">Search entities</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entities" className="w-36 bg-transparent text-[12px] outline-none" />
            </label>

            <div className="flex items-center gap-1 rounded-full border border-line bg-white/90 p-1">
              <button
                onClick={() => setTierFilter("all")}
                aria-pressed={tierFilter === "all"}
                className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", tierFilter === "all" ? "bg-ink text-white" : "text-muted hover:text-ink")}
              >
                All
              </button>
              <button
                onClick={() => setTierFilter("white_space")}
                aria-pressed={tierFilter === "white_space"}
                className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", tierFilter === "white_space" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:bg-emerald-50")}
              >
                🎯 Leans to brand
              </button>
              <button
                onClick={() => setTierFilter("subcultural_orbit")}
                aria-pressed={tierFilter === "subcultural_orbit"}
                className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", tierFilter === "subcultural_orbit" ? "bg-cyan-600 text-white shadow-sm" : "text-cyan-700 hover:bg-cyan-50")}
              >
                🪐 Subcultural Orbits
              </button>
              <button
                onClick={() => setTierFilter("consensus")}
                aria-pressed={tierFilter === "consensus"}
                className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", tierFilter === "consensus" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                🤝 Consensus
              </button>
              <button
                onClick={() => setTierFilter("competitor_stronghold")}
                aria-pressed={tierFilter === "competitor_stronghold"}
                className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", tierFilter === "competitor_stronghold" ? "bg-coral text-white" : "text-coral hover:bg-coral/10")}
              >
                🛡️ Competitor
              </button>
            </div>

            {presentTypes.map((t) => (
              <button key={t} onClick={() => toggleType(t)} aria-pressed={types.has(t)} className={cn("rounded-full border px-3 py-1.5 text-[12px] transition-colors", types.has(t) ? "border-violet bg-lilac text-violet-ink" : "border-line bg-white/85 text-ink/75 hover:bg-white")}>
                {TYPE_LABEL[t] ?? t}
              </button>
            ))}
            {(types.size > 0 || tierFilter !== "all") && (
              <button onClick={() => { setTypes(new Set()); setTierFilter("all"); }} className="text-[12px] text-muted underline-offset-2 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}

        {view === "report" && p.deep && p.run ? (
          <div className="relative z-10 space-y-4 px-4 pb-6 sm:px-6 md:px-8">
            {p.run.status === "failed" && failedNotice}
            {runActive ? (
              <ResearchProgress projectId={p.project.id} runId={p.run.id} stage={live?.stage ?? p.deep.stage} live={live} cancelRequested={p.deep.cancelRequested} canCancel={p.canRun} />
            ) : (
              <ResearchReport deep={p.deep} isDemo={isDemoRun} projectId={p.project.id} runId={p.run.id} canEdit={p.canRun} />
            )}
          </div>
        ) : (
        <div className="relative h-[620px] shrink-0">
          {!p.run ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-lg rounded-cc-lg border border-line bg-paper/90 p-6 shadow-card">
                <p className="cc-eyebrow text-muted">Research plan</p>
                <p className="mt-2 text-[15px] font-medium">{p.plan.question}</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
                  <li><b className="font-medium text-ink">Signals:</b> {p.plan.seeds.length ? p.plan.seeds.join(", ") : "none from the brief"}{p.plan.location ? ` · location “${p.plan.location}”` : ""}</li>
                  <li><b className="font-medium text-ink">Entity types:</b> {p.plan.targets.map((t) => TYPE_LABEL[t.replace("urn:entity:", "")] ?? t).join(", ")}, taste tags</li>
                  {p.plan.notes.map((n) => <li key={n} className="flex gap-1.5"><Info className="mt-0.5 size-3.5 shrink-0" /> {n}</li>)}
                </ul>
                {!p.qlooConfigured && (
                  <ErrorNotice className="mt-4" title="Qloo is not configured" body={<>Live research needs <code>QLOO_API_KEY</code> on the server. {p.demoAllowed ? "You can run a clearly labelled demonstration instead." : "Ask an admin to configure it in Settings → Integrations."}</>} />
                )}
                <div className="mt-5">{runControls || <p className="text-[12px] text-muted">Your role can view research but not start runs.</p>}</div>
                <p className="mt-3 text-[11px] text-faint"><Link href={`/projects/${p.project.id}/brief`} className="underline">Improve the brief</Link> to sharpen the signals.</p>
              </div>
            </div>
          ) : p.run.status === "failed" ? (
            <div className="flex h-full items-center justify-center p-8">{failedNotice}</div>
          ) : runActive ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" role="status">
              <div className="relative size-40">
                <div className="cc-animate-pulse absolute inset-0 rounded-full bg-[radial-gradient(circle,#B8A5FF,#8064F5_70%)] opacity-70 blur-sm" />
                <div className="absolute inset-6 rounded-full border border-white/50" />
              </div>
              <p className="text-[15px] font-medium">{p.run.mode === "demo" ? "Assembling demonstration data…" : "Querying Qloo…"}</p>
              <p className="max-w-sm text-[13px] text-muted">Status updates as each provider request is recorded. Progress isn’t shown as a percentage because the number of results isn’t known in advance.</p>
            </div>
          ) : observations.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState className="max-w-md bg-paper" title="No entities were returned" body={p.run.interpretation?.summary ?? "The provider returned no results for this signal. Nothing has been inferred. Try adding competitors or a market to the brief."} action={{ href: `/projects/${p.project.id}/brief`, label: "Edit brief" }} />
            </div>
          ) : view === "network" ? (
            <CulturalNetwork
              entities={p.entities}
              relationships={p.relationships}
              selectedId={selected}
              onSelect={setSelected}
              typeFilter={types}
              tierFilter={tierFilter}
              query={query}
              audienceLabel={[p.project.market, p.plan.seeds[0]].filter(Boolean).join(" · ") || "Brief signal"}
              theme={p.theme}
            />
          ) : (
            <div className="h-full overflow-auto px-6 pb-6 md:px-8">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <caption className="sr-only">Entities returned by the research run</caption>
                <thead className="sticky top-0 bg-paper text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="py-2 font-medium">Entity</th>
                    <th className="py-2 font-medium">Tier</th>
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium">Role</th>
                    <th className="py-2 text-right font-medium">Affinity</th>
                    <th className="py-2 text-right font-medium">Popularity</th>
                  </tr>
                </thead>
                <tbody>
                  {p.entities
                    .filter(
                      (e) =>
                        (types.size === 0 || e.role === "seed" || types.has(e.role === "tag" ? "tag" : e.type)) &&
                        (tierFilter === "all" || e.role === "seed" || e.culturalTier === tierFilter) &&
                        (!query || e.name.toLowerCase().includes(query.toLowerCase())),
                    )
                    .map((e) => (
                      <tr key={e.id} className={cn("border-t border-line", selected === e.id && "bg-lilac/40")}>
                        <td className="py-2">
                          <button onClick={() => setSelected(e.id)} className="text-left font-medium hover:text-violet">
                            {e.name}
                          </button>
                        </td>
                        <td className="py-2">
                          {e.culturalTier === "white_space" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              🎯 Leans to brand
                            </span>
                          ) : e.culturalTier === "competitor_stronghold" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-medium text-coral">
                              🛡️ Competitor
                            </span>
                          ) : e.role === "result" ? (
                            <span className="text-[11px] text-muted">Consensus</span>
                          ) : (
                            <span className="text-[11px] text-faint">—</span>
                          )}
                        </td>
                        <td className="py-2 text-muted">{e.role === "tag" ? "taste tag" : e.type}</td>
                        <td className="py-2 text-muted">{e.role === "seed" ? "signal (from brief)" : e.role}</td>
                        <td className="py-2 text-right tabular-nums">{e.affinity?.toFixed(2) ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums text-muted">{e.popularity?.toFixed(2) ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {(p.run?.status === "completed" || p.run?.status === "partially_completed") && view !== "report" && (
          <dl className="relative z-10 grid grid-cols-3 gap-4 border-t border-line/70 px-6 py-5 md:px-8 lg:max-w-2xl lg:border-0">
            <div className="border-r border-line pr-4"><dd className="text-3xl font-light tracking-tight">{observations.filter((e) => e.role === "result").length}</dd><dt className="text-[12px] text-muted">Cultural entities</dt></div>
            <div className="border-r border-line pr-4"><dd className="text-3xl font-light tracking-tight">{observations.filter((e) => e.role === "tag").length}</dd><dt className="text-[12px] text-muted">Taste tags</dt></div>
            <div><dd className="text-3xl font-light tracking-tight">{p.opportunityCount}</dd><dt className="text-[12px] text-muted">Opportunities saved</dt></div>
          </dl>
        )}
      </section>

      {/* Contextual research panel */}
      <aside className="flex flex-col gap-4" aria-label="Research details">
        {selectedEntity ? (
          <EntityPanel entity={selectedEntity} entities={p.entities} relationships={p.relationships} sources={p.sources} run={p.run!} projectId={p.project.id} onClose={() => setSelected(null)} onSelect={setSelected}
            externalClaims={(p.deep?.claims ?? []).filter((c) => c.evidenceType === "external_source" && c.entityIds.includes(selectedEntity.id))} />
        ) : (
          <>
            {p.featured ? (
              <Link href={`/projects/${p.project.id}/opportunities#opp-${p.featured.id}`} className="group relative block overflow-hidden rounded-[28px] bg-charcoal text-white">
                <ArtPlate theme={p.theme} seed={p.featured.id} rounded={false} className="absolute inset-0 opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 to-charcoal/10" />
                <div className="relative flex min-h-[170px] flex-col justify-end p-5">
                  <div className="absolute right-4 top-4 flex gap-1.5">{p.featured.isDemo && <DemoBadge label="Demo" />}<Badge tone="glass">Hypothesis</Badge></div>
                  <p className="cc-eyebrow text-[10px] text-white/70">Opportunity</p>
                  <p className="cc-display mt-1 text-3xl">{p.featured.title}</p>
                  <span className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-0.5"><ArrowRight className="size-4" /></span>
                </div>
                <p className="relative line-clamp-3 bg-paper px-5 py-4 text-[13px] leading-relaxed text-muted">{p.featured.description}</p>
              </Link>
            ) : (
              <div className="rounded-[28px] border border-dashed border-line-strong bg-paper/60 p-5 text-[13px] text-muted">
                <p className="cc-eyebrow text-[10px]">Opportunity</p>
                <p className="mt-2">{p.run?.status === "completed" || p.run?.status === "partially_completed" ? "Turn this research into opportunity hypotheses." : "Opportunities appear once research is complete."}</p>
                {(p.run?.status === "completed" || p.run?.status === "partially_completed") && <Button asChild size="sm" variant="soft" className="mt-3"><Link href={`/projects/${p.project.id}/opportunities?generate=1`}>Generate opportunities</Link></Button>}
              </div>
            )}
            <RunOverview run={p.run} entities={p.entities} projectId={p.project.id} generatorLabel={p.generatorLabel} onSelect={setSelected} theme={p.theme} />
          </>
        )}
        <CopilotPanel projectId={p.project.id} initial={p.copilot.messages} conversationId={p.copilot.conversationId} llm={p.llm} compact />
      </aside>
    </div>
  );
}

function RunOverview({ run, entities, projectId, generatorLabel, onSelect, theme }: { run: RunRow | null; entities: EntityRow[]; projectId: string; generatorLabel: string | null; onSelect: (id: string) => void; theme: PlateTheme }) {
  if (!run || (run.status !== "completed" && run.status !== "partially_completed")) return null;
  const it = run.interpretation;
  const top = entities.filter((e) => e.role === "result").sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, 3);
  return (
    <>
      <section className="rounded-[28px] border border-line bg-paper p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Research overview</h2>
          {run.errorCode === "partial" && <Badge tone="warning">Partial</Badge>}
        </div>
        <p className="mt-1 text-[11px] text-muted">Question: {run.question}</p>
        {it && (
          <>
            <div className="mt-3 rounded-cc-sm bg-lilac/35 p-3">
              <p className="cc-eyebrow text-[9px] text-violet-ink">Interpretation · {generatorLabel}</p>
              <p className="mt-1 text-[13px] leading-relaxed">{it.summary}</p>
            </div>
            {it.findings.length > 0 && (
              <ul className="mt-3 space-y-2">
                {it.findings.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug">
                    <span className={cn("mt-1 h-3 w-0.5 shrink-0 rounded", f.kind === "observation" ? "bg-ink" : "bg-violet")} />
                    <span><span className="text-faint">{f.kind === "observation" ? "Observed" : "Interpretation"} · </span>{f.statement}</span>
                  </li>
                ))}
              </ul>
            )}
            {it.missingInformation.length > 0 && (
              <details className="mt-3 text-[12px]">
                <summary className="cursor-pointer font-medium">Missing information & follow-ups ({it.missingInformation.length + it.followUpQuestions.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">{[...it.missingInformation, ...it.followUpQuestions].map((m, i) => <li key={i}>{m}</li>)}</ul>
              </details>
            )}
            {it.contradictions.length > 0 && <p className="mt-2 text-[12px] text-warning">Contradictions: {it.contradictions.join("; ")}</p>}
          </>
        )}
      </section>

      {it?.culturalPulse && (
        <section className="rounded-[28px] border border-line bg-paper p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-ink">Cultural pulse (earlier AI summary)</h2>
            <Badge tone="outline">AI interpretation</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted">Generated by an earlier version without source verification. Newer runs show a cited research report instead.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink/90 font-medium">
            {it.culturalPulse.zeitgeistSummary}
          </p>

          <div className="mt-3 space-y-2">
            <p className="cc-eyebrow text-[9px] text-cyan-700">Emerging Micro-Aesthetics</p>
            <div className="grid grid-cols-1 gap-2">
              {it.culturalPulse.microAesthetics.map((a, i) => (
                <div key={i} className="rounded-xl border border-cyan-500/20 bg-white/70 p-2.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-ink">{a.name}</span>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-medium text-cyan-800">{a.platformOrigin}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{a.description}</p>
                  <p className="mt-1 text-[10px] text-cyan-900/80 italic">{a.audienceRelevance}</p>
                </div>
              ))}
            </div>
          </div>

          {it.culturalPulse.culturalTensions.length > 0 && (
            <div className="mt-3">
              <p className="cc-eyebrow text-[9px] text-violet">Active Category Friction</p>
              <ul className="mt-1.5 space-y-1.5">
                {it.culturalPulse.culturalTensions.map((t, i) => (
                  <li key={i} className="rounded-lg bg-violet/5 p-2 text-[11px]">
                    <span className="font-semibold text-ink">{t.tension}: </span>
                    <span className="text-muted">{t.implicationForBrand}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {it.culturalPulse.liveWebSources && it.culturalPulse.liveWebSources.length > 0 && (
            <div className="mt-3">
              <p className="cc-eyebrow text-[9px] text-cyan-800">Verified Live Web Intelligence</p>
              <ul className="mt-1.5 space-y-2">
                {it.culturalPulse.liveWebSources.map((w, i) => (
                  <li key={i} className="rounded-xl border border-line bg-white/80 p-2 text-[11px] shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-ink line-clamp-1">{w.title}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700">{w.source}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted line-clamp-2">{w.snippet}</p>
                    {w.url && (
                      <a href={w.url} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-700 hover:underline">
                        <span>Read original source</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {top.length > 0 && (
        <section className="rounded-[28px] border border-line bg-paper p-5 shadow-card">
          <div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">Supporting evidence</h2><Link href={`/projects/${projectId}/opportunities#evidence`} className="text-[12px] text-muted hover:text-ink">All →</Link></div>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {top.map((e) => (
              <li key={e.id}>
                <button onClick={() => onSelect(e.id)} className="group w-full text-left">
                  <EntityImage src={e.imageUrl} theme={TYPE_THEME[e.type] ?? theme} seed={e.providerId} className="aspect-[4/5] w-full" />
                  <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight group-hover:text-violet">{e.name}</p>
                  <p className="text-[10px] text-muted">{e.type} · {e.affinity?.toFixed(2) ?? "—"}</p>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-faint">Photos come from Qloo where available; otherwise the artwork is illustrative. Values come from the provider.</p>
        </section>
      )}
    </>
  );
}

function PopularityHistory({ history }: { history: { value: number; at: string }[] }) {
  if (history.length < 2) {
    return <p className="mt-2 text-[11px] text-muted">One Qloo popularity observation so far. Run research again later to see how it changes over time.</p>;
  }
  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.value - first.value;
  return (
    <p className="mt-2 text-[11px] text-muted">
      Qloo popularity across {history.length} observations: {first.value.toFixed(3)} ({new Date(first.at).toLocaleDateString()}) → {last.value.toFixed(3)} ({new Date(last.at).toLocaleDateString()}),
      {" "}<b className={cn("font-medium", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-ink")}>{delta >= 0 ? "+" : ""}{delta.toFixed(3)}</b>. Relative popularity, not search volume.
    </p>
  );
}

function EntityPanel({ entity: e, entities, relationships, sources, run, projectId, onClose, onSelect, externalClaims }: {
  entity: EntityRow; entities: EntityRow[]; relationships: RelRow[]; sources: SourceRow[]; run: RunRow; projectId: string; onClose: () => void; onSelect: (id: string) => void;
  externalClaims: ClaimRow[];
}) {
  const source = sources.find((s) => s.id === e.sourceId);
  const related = relationships.filter((r) => r.from === e.id || r.to === e.id).map((r) => ({ r, other: entities.find((x) => x.id === (r.from === e.id ? r.to : r.from)) })).filter((x) => x.other);
  const interp = run.interpretation?.findings.filter((f) => f.kind === "interpretation" && e.evidenceId && f.evidenceIds.includes(e.evidenceId)) ?? [];
  return (
    <section className="cc-animate-in rounded-[28px] border border-line bg-paper p-5 shadow-card" aria-label={`Details for ${e.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="cc-eyebrow text-[10px] text-muted">{e.role === "seed" ? "Signal entity (from brief)" : e.role === "tag" ? "Taste tag" : `Entity · ${e.type}`}</p>
          <h2 className="cc-display mt-1 text-3xl">{e.name}</h2>
          {e.culturalTier === "white_space" && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-800">
              <span>🎯 Leans to brand</span>
              <span className="text-[10px] text-emerald-600/90 font-normal">· Qloo explains it more by the brand’s signal than competitors’</span>
            </div>
          )}
          {e.culturalTier === "subcultural_orbit" && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-800">
              <span>🪐 2-Hop Subcultural Orbit</span>
              {e.subculturalAnchor && (
                <span className="text-[10px] text-cyan-600/90 font-normal">· Anchored to {e.subculturalAnchor}</span>
              )}
            </div>
          )}
          {e.culturalTier === "competitor_stronghold" && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral/10 px-3 py-1 text-[11px] font-semibold text-coral">
              <span>🛡️ Leans to competitors</span>
              <span className="text-[10px] text-coral/80 font-normal">· Qloo explains it more by competitors’ signals</span>
            </div>
          )}
          {e.culturalTier === "consensus" && e.role === "result" && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-ivory px-3 py-1 text-[11px] font-medium text-muted">
              <span>🤝 Category Consensus</span>
              <span className="text-[10px] text-faint font-normal">· Shared with competitors</span>
            </div>
          )}
          {e.profileOf && <p className="mt-1 text-[12px] text-muted">From Qloo’s profile of {e.profileOf}</p>}
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5" aria-label="Close details"><X className="size-4" /></button>
      </div>
      {run.mode === "demo" && <DemoBadge className="mt-2" />}
      {e.imageUrl && <EntityImage src={e.imageUrl} alt={e.name} theme="culture" seed={e.providerId} className="mt-4 aspect-[16/10] w-full" />}
      <div className="mt-4 rounded-cc-sm border border-line p-3">
        <p className="cc-eyebrow text-[9px] text-muted">Observed data · {run.mode === "demo" ? "demonstration fixture" : "Qloo"}</p>
        <dl className="mt-2 grid grid-cols-2 gap-y-2 text-[12px]">
          <dt className="text-muted">Affinity</dt><dd className="text-right font-medium tabular-nums">{e.affinity?.toFixed(3) ?? "not returned"}</dd>
          <dt className="text-muted">Popularity</dt><dd className="text-right tabular-nums">{e.popularity?.toFixed(3) ?? "not returned"}</dd>
          <dt className="text-muted">Provider ID</dt><dd className="truncate text-right font-mono text-[10px]" title={e.providerId}>{e.providerId}</dd>
          <dt className="text-muted">Retrieved</dt><dd className="text-right"><When value={e.retrievedAt} /></dd>
        </dl>
        {e.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{e.tags.map((t) => <Badge key={t} tone="outline">{t}</Badge>)}</div>}
        {e.description && <p className="mt-2 text-[12px] text-muted">{e.description}</p>}
        {run.mode !== "demo" && e.popularity !== null && <PopularityHistory history={e.popularityHistory ?? []} />}
      </div>
      {externalClaims.length > 0 && (
        <div className="mt-3 rounded-cc-sm border border-line p-3">
          <p className="cc-eyebrow text-[9px] text-muted">External evidence about this entity · {externalClaims.length}</p>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {externalClaims.slice(0, 4).map((c) => (
              <li key={c.id}>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-violet">{c.text}</a> : c.text} <span className="text-muted">· {c.provider}</span></li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-faint">Retrieved to investigate this Qloo result; open the Report to see how it was used.</p>
        </div>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        {e.profileOf
          ? "Profile tags show how Qloo catalogues the brand itself. They describe the brand, not the audience’s affinity."
          : e.role === "seed"
          ? "This entity was resolved from the brief and used as an input signal. Check that the provider matched the intended brand."
          : "Affinity is a relative measure of how strongly this entity correlates with the taste of people connected to the research signal. It does not show purchase intent, campaign effectiveness or causation."}
      </p>
      {source && (
        <div className="mt-3 text-[11px] text-muted">
          <p className="font-medium text-ink">Source</p>
          <p className="mt-0.5 font-mono">{source.endpoint} · {Object.entries(source.params).map(([k, v]) => `${k}=${v}`).join(" & ").slice(0, 160)}</p>
          <p>HTTP {source.httpStatus ?? "—"} · {source.resultCount} results · <When value={source.retrievedAt} /></p>
        </div>
      )}
      {related.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium">Related entities (explainability)</p>
          <ul className="mt-1 space-y-1">
            {related.map(({ r, other }) => (
              <li key={r.id}><button onClick={() => onSelect(other!.id)} className="flex w-full justify-between text-[12px] hover:text-violet"><span>{other!.name}</span><span className="tabular-nums text-muted">{r.value?.toFixed(2)}</span></button></li>
            ))}
          </ul>
        </div>
      )}
      {interp.length > 0 && (
        <div className="mt-3 rounded-cc-sm bg-lilac/35 p-3">
          <p className="cc-eyebrow text-[9px] text-violet-ink">AI interpretation — not observed data</p>
          {interp.map((f, i) => <p key={i} className="mt-1 text-[12px]">{f.statement}</p>)}
        </div>
      )}
      {e.evidenceId && (
        <Button asChild size="sm" variant="outline" className="mt-4 w-full">
          <Link href={`/projects/${projectId}/evidence/${e.evidenceId}`}><ExternalLink /> Verify evidence & raw response</Link>
        </Button>
      )}
    </section>
  );
}
