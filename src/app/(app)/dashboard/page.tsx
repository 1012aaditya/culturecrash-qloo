import type { Metadata } from "next";
import Link from "next/link";
import { MotionWords } from "@/components/motion/motion-words";
import { ArrowRight, FileText, FlaskConical, Lightbulb, Plus, Sparkles } from "lucide-react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { AskEntry } from "@/components/nav/ask-entry";
import { StageDots } from "@/components/projects/stage-dots";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, Surface } from "@/components/ui/surface";
import { getDashboard } from "@/lib/data/dashboard";
import { openDemoWorkspaceAction } from "@/app/(app)/actions";
import { demoModeAllowed } from "@/lib/env";
import { currentStage, listProjects, stageStates } from "@/lib/data/projects";
import { firstName, getCtx } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";
import { STAGES } from "@/lib/stages";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await getCtx();
  const [projects, d] = await Promise.all([listProjects(ctx), getDashboard(ctx)]);
  const canCreate = can(ctx.workspace.role, "project.create");
  const [featured, ...rest] = projects;

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_1.35fr] [&>*]:min-w-0">
        <div className="flex flex-col justify-between gap-8 py-4">
          <div>
            <p className="cc-eyebrow text-muted">{ctx.workspace.name}</p>
            <h1 className="cc-display mt-4 text-6xl md:text-7xl"><MotionWords>{`${greeting()}, ${firstName(ctx)}.`}</MotionWords></h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              {projects.length === 0
                ? "Your workspace is ready. Start with a campaign brief — research, strategy and reports build from there."
                : `${projects.length} active ${projects.length === 1 ? "campaign" : "campaigns"} in this workspace.`}
            </p>
          </div>
          <div className="space-y-3">
            {canCreate && <Button asChild size="lg"><Link href="/projects/new"><Plus /> New campaign</Link></Button>}
            <AskEntry />
            {demoModeAllowed() && !ctx.workspace.isDemo && !ctx.memberships.some((m) => m.isDemo) && (
              <form action={openDemoWorkspaceAction}><Button type="submit" variant="ghost" size="sm"><FlaskConical /> Open a demo workspace (fixture data)</Button></form>
            )}
          </div>
        </div>

        {featured ? (
          <Link href={`/projects/${featured.id}`} className="cc-lift cc-animate-in group relative min-h-[380px] overflow-hidden rounded-[36px] bg-charcoal text-white shadow-card" style={{ animationDelay: "0.15s", animationDuration: "0.8s" }}>
            <ArtPlate theme={themeForCategory(featured.category)} seed={featured.id} rounded={false} className="absolute inset-0 transition-transform duration-[1.4s] ease-[var(--cc-ease-out)] group-hover:scale-[1.05]" />
            <div className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-between p-8">
              <div className="flex gap-2"><Badge tone="glass">Continue · {STAGES.find((s) => s.key === currentStage(featured))!.label}</Badge>{featured.isDemo && <DemoBadge />}</div>
              <div className="max-w-md">
                <p className="cc-eyebrow text-white/60">Project</p>
                <h2 className="cc-display mt-2 text-6xl">{featured.name}</h2>
                <p className="mt-2 text-sm text-white/70">{[featured.clientName, featured.category, featured.market].filter(Boolean).join(" · ")}</p>
                <div className="mt-5 flex items-center gap-4 text-[12px] text-white/70"><StageDots states={stageStates(featured)} dark /> Updated {timeAgo(featured.updatedAt)}</div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="relative min-h-[380px] overflow-hidden rounded-[36px] bg-charcoal p-8 text-white">
            <ArtPlate theme="culture" seed="onboarding" rounded={false} className="absolute inset-0 opacity-70" />
            <ol className="cc-stagger relative grid h-full content-end gap-3 sm:grid-cols-5">
              {STAGES.map((s) => (
                <li key={s.key} className="rounded-cc border border-white/15 bg-white/5 p-4 backdrop-blur">
                  <p className="font-mono text-[11px] text-white/50">{s.number}</p>
                  <p className="mt-1 font-medium">{s.label}</p>
                  <p className="mt-2 text-[11px] leading-snug text-white/60">{s.summary}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:col-span-7">
          <SectionTitle eyebrow="Recent work" title="Projects" action={<Link href="/projects" className="text-[13px] text-muted hover:text-ink">All projects →</Link>} />
          {rest.length === 0 ? (
            <EmptyState className="mt-4" title={projects.length ? "Only one campaign so far" : "No campaigns yet"} body="Recent campaigns appear here with their stage and research status." />
          ) : (
            <ul className="cc-stagger mt-4 grid gap-3 sm:grid-cols-2" style={{ ["--cc-stagger-delay" as string]: "250ms" }}>
              {rest.slice(0, 4).map((p, i) => (
                <li key={p.id} className={cn(i === 0 && "sm:row-span-2")}>
                  <Link href={`/projects/${p.id}`} className={cn("cc-lift group flex h-full gap-4 rounded-cc-lg border border-line bg-paper p-3", i === 0 && "flex-col")}>
                    <div className={cn("cc-zoom shrink-0 rounded-cc", i === 0 ? "h-52 w-full" : "h-20 w-20")}><ArtPlate theme={themeForCategory(p.category)} seed={p.id} className="size-full" /></div>
                    <div className="min-w-0 py-1">
                      <p className="truncate font-medium group-hover:text-violet">{p.name}</p>
                      <p className="truncate text-[12px] text-muted">{[p.clientName, p.market].filter(Boolean).join(" · ") || "—"}</p>
                      <div className="mt-3"><StageDots states={stageStates(p)} /></div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Surface className="p-5">
            <SectionTitle eyebrow="Research" title="Active and recent runs" action={<Link href="/tasks" className="text-[13px] text-muted hover:text-ink">Tasks →</Link>} />
            {d.runs.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">No research runs in the last three days.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {d.runs.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <span className={cn("size-2 rounded-full", r.status === "failed" ? "bg-danger" : r.status === "completed" ? "bg-success" : "bg-violet cc-animate-pulse")} />
                    <Link href={`/projects/${r.project_id}/research?run=${r.id}`} className="min-w-0 flex-1 truncate hover:text-violet">{r.project}</Link>
                    {r.mode === "demo" && <DemoBadge label="Demo" />}
                    <span className="text-muted">{r.status} · {timeAgo(r.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
          <Surface className="p-5">
            <SectionTitle eyebrow="Reports" title="Awaiting review" />
            {d.reports.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">No reports yet. Generate one from a campaign’s Track stage.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {d.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/projects/${r.project_id}/reports/${r.id}`} className="flex items-center gap-3 rounded-cc-sm p-2 text-[13px] hover:bg-ivory">
                      <FileText className="size-4 text-violet" />
                      <span className="min-w-0 flex-1 truncate">{r.title}<span className="text-muted"> · {r.project}</span></span>
                      <span className="text-[12px] text-muted">v{r.version ?? 1}{r.shares ? " · shared" : " · not shared"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <Surface className="p-5 lg:col-span-5">
          <SectionTitle eyebrow="Interpret" title="Recent opportunities" />
          {d.opportunities.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Opportunities appear after research completes. Each one is a hypothesis with its evidence attached.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.opportunities.map((o) => (
                <li key={o.id}>
                  <Link href={`/projects/${o.project_id}/opportunities#opp-${o.id}`} className="flex items-start gap-3 rounded-cc-sm p-2 hover:bg-ivory">
                    <Lightbulb className="mt-0.5 size-4 text-coral" />
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{o.title}</span><span className="text-[12px] text-muted">{o.project} · {o.status}</span></span>
                    {o.is_demo && <DemoBadge label="Demo" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <Surface className="p-5 lg:col-span-4">
          <SectionTitle eyebrow="Test" title="Experiments" />
          {d.results.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">No experiments yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.results.map((x) => (
                <li key={x.id}>
                  <Link href={`/projects/${x.project_id}/experiments/${x.id}`} className="flex items-start gap-3 rounded-cc-sm p-2 hover:bg-ivory">
                    <FlaskConical className="mt-0.5 size-4 text-violet" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{x.name}</span><span className="text-[12px] text-muted">{x.status} · {x.result_count ? `${x.result_count} results recorded` : "no results recorded"}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <Surface className="p-5 lg:col-span-3">
          <SectionTitle eyebrow="Team" title="Activity" action={<Link href="/workspace/activity" className="text-[13px] text-muted hover:text-ink">All →</Link>} />
          {d.activity.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Changes by your team show up here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {d.activity.map((a) => (
                <li key={a.id} className="text-[12px] leading-snug"><span className="font-medium">{a.actor}</span> <span className="text-muted">{a.summary}</span><span className="block text-faint">{timeAgo(a.created_at)}</span></li>
              ))}
            </ul>
          )}
        </Surface>
      </section>
      {projects.length > 0 && (
        <p className="mt-8 flex items-center gap-2 text-[12px] text-muted"><Sparkles className="size-3.5 text-violet" /> Counts and statuses on this page come from saved records only. <Link href="/help" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">How CultureCrash labels evidence <ArrowRight className="size-3" /></Link></p>
      )}
    </div>
  );
}
