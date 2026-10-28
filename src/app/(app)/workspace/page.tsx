import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, FolderOpen, Settings, UserPlus } from "lucide-react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { Avatar } from "@/components/nav/avatar";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, Surface } from "@/components/ui/surface";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { getCtx } from "@/lib/data/workspace";
import { getWorkspaceOverview, listMembers, PLAN_LIMITS, USAGE_EVENT_LABEL } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Workspace" };

const HEADLINE_EVENTS = ["research_run_started", "research_run_completed", "project_created", "report_exported"] as const;

export default async function WorkspaceOverviewPage({ searchParams }: PageProps<"/workspace">) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [o, members] = await Promise.all([getWorkspaceOverview(ctx), listMembers(ctx)]);
  const usage = new Map(o.usage.map((u) => [u.event, u.count]));
  const otherUsage = o.usage.filter((u) => !(HEADLINE_EVENTS as readonly string[]).includes(u.event));
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  const totalProjects = o.counts.active_projects + o.counts.draft_projects;
  const plan = PLAN_LIMITS[o.workspace.plan] ?? PLAN_LIMITS.pilot;

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      {sp.created === "1" && (
        <p role="status" className="mb-6 rounded-cc border border-violet/20 bg-lilac/40 px-4 py-3 text-[13px]">
          Workspace created — you’re its owner and it’s now your active workspace. Invite your team from <Link className="underline" href="/settings/team">Team settings</Link>.
        </p>
      )}

      <section className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-end">
        <div>
          <p className="cc-eyebrow text-muted">Agency workspace · {ctx.workspace.role}</p>
          <h1 className="cc-display mt-4 text-5xl md:text-7xl">{o.workspace.name}</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            {members.length} {members.length === 1 ? "person" : "people"}, {o.counts.clients} {o.counts.clients === 1 ? "client" : "clients"} and {totalProjects} open{" "}
            {totalProjects === 1 ? "campaign" : "campaigns"}. Everything here is private to this workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline"><Link href="/workspace/clients"><Building2 /> Clients</Link></Button>
          {can(ctx.workspace.role, "team.manage") && <Button asChild variant="outline"><Link href="/settings/team"><UserPlus /> Invite</Link></Button>}
          <Button asChild variant="ghost"><Link href="/settings/workspace"><Settings /> Settings</Link></Button>
        </div>
      </section>

      <div className="mt-8"><WorkspaceTabs clientCount={o.counts.clients} /></div>

      <section className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* Usage this month: the visual anchor */}
        <div className="relative min-h-[340px] overflow-hidden rounded-[36px] bg-charcoal text-white lg:col-span-7">
          <ArtPlate theme="culture" seed={ctx.workspace.workspaceId} rounded={false} className="absolute inset-0 opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-tr from-charcoal via-charcoal/70 to-transparent" />
          <div className="relative flex h-full flex-col justify-between gap-8 p-7 md:p-9">
            <div className="flex items-center justify-between gap-3">
              <p className="cc-eyebrow text-white/60">Usage · {month}</p>
              <Badge tone="glass">{plan.name} · {o.workspace.dailyLimit} runs / 24 h</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
              {HEADLINE_EVENTS.map((e) => (
                <div key={e}>
                  <dd className="cc-display text-6xl">{usage.get(e) ?? 0}</dd>
                  <dt className="mt-2 text-[12px] leading-snug text-white/65">{USAGE_EVENT_LABEL[e]}</dt>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/60">
              {otherUsage.length ? otherUsage.slice(0, 4).map((u) => <span key={u.event}>{USAGE_EVENT_LABEL[u.event] ?? u.event}: {u.count}</span>) : <span>Counted from recorded product events since the 1st.</span>}
              <Link href="/settings/billing" className="ml-auto inline-flex items-center gap-1 text-white hover:underline">Usage &amp; limits <ArrowRight className="size-3" /></Link>
            </div>
          </div>
        </div>

        <Surface className="p-6 lg:col-span-5">
          <SectionTitle eyebrow="People" title="Members" action={<Link href="/settings/team" className="text-[13px] text-muted hover:text-ink">Team →</Link>} />
          <ul className="mt-4 space-y-1">
            {members.slice(0, 7).map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-cc-sm py-1.5">
                <Avatar name={m.name} className="size-8 border-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{m.name}{m.userId === ctx.user.id && <span className="font-normal text-muted"> · you</span>}</span>
                  <span className="block truncate text-[12px] text-muted">{m.jobTitle ?? m.email}</span>
                </span>
                <Badge tone={m.role === "owner" ? "dark" : m.role === "admin" ? "violet" : "outline"}>{m.role}</Badge>
              </li>
            ))}
          </ul>
          {members.length > 7 && <p className="mt-2 text-[12px] text-muted">and {members.length - 7} more</p>}
          {members.length === 1 && <p className="mt-3 text-[12px] text-muted">Just you so far. Admins can invite teammates from Team settings.</p>}
        </Surface>

        <Surface className="p-6 lg:col-span-4">
          <SectionTitle eyebrow="Portfolio" title={`${o.counts.clients} ${o.counts.clients === 1 ? "client" : "clients"}`} action={<Link href="/workspace/clients" className="text-[13px] text-muted hover:text-ink">All →</Link>} />
          {o.clients.length === 0 ? (
            <EmptyState className="mt-4 p-5" icon={Building2} title="No clients yet" body="Add a client to keep its campaigns, reports and brand memory together." action={{ href: "/workspace/clients", label: "Add a client" }} />
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {o.clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/workspace/clients/${c.id}`} className="flex items-center gap-3 py-2.5 text-[13px] hover:text-violet">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}<span className="font-normal text-muted">{c.industry ? ` · ${c.industry}` : ""}</span></span>
                    <span className="text-[12px] text-muted">{c.projectCount} {c.projectCount === 1 ? "campaign" : "campaigns"}</span>
                    {c.brandStatus === "approved" && <Badge tone="success">brand ✓</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="p-6 lg:col-span-8">
          <SectionTitle
            eyebrow="Campaigns"
            title={`${o.counts.active_projects} active · ${o.counts.draft_projects} draft · ${o.counts.archived_projects} archived`}
            action={<Link href="/projects" className="text-[13px] text-muted hover:text-ink">Library →</Link>}
          />
          {o.projects.length === 0 ? (
            <EmptyState className="mt-4 p-5" icon={FolderOpen} title="No campaigns yet" body="Campaigns you create appear here with their client." action={can(ctx.workspace.role, "project.create") ? { href: "/projects/new", label: "New campaign" } : undefined} />
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {o.projects.map((p, i) => (
                <li key={p.id} className={cn(i === 0 && "sm:col-span-2 xl:col-span-1 xl:row-span-2")}>
                  <Link href={`/projects/${p.id}`} className={cn("group flex h-full gap-3 rounded-cc border border-line p-2.5 transition-shadow hover:shadow-card", i === 0 && "xl:flex-col")}>
                    <ArtPlate theme={themeForCategory(p.category)} seed={p.id} className={cn("shrink-0", i === 0 ? "h-16 w-16 xl:h-40 xl:w-full" : "h-16 w-16")} />
                    <span className="min-w-0 py-0.5">
                      <span className="block truncate text-[13px] font-medium group-hover:text-violet">{p.name}</span>
                      <span className="block truncate text-[12px] text-muted">{p.clientName ?? "No client"} · {p.status}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-faint">{timeAgo(p.updatedAt)} {p.isDemo && <DemoBadge label="Demo" />}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="p-6 lg:col-span-12">
          <SectionTitle eyebrow="History" title="Recent activity" action={<Link href="/workspace/activity" className="text-[13px] text-muted hover:text-ink">Full history →</Link>} />
          {o.activity.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Changes by your team — new campaigns, research runs, approvals — show up here.</p>
          ) : (
            <ul className="mt-3 grid gap-x-8 md:grid-cols-2">
              {o.activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[13px]">
                  <span className="min-w-0"><b className="font-medium">{a.actor}</b> <span className="text-muted">{a.summary}</span>{a.project && <span className="text-faint"> · {a.project}</span>}</span>
                  <span className="shrink-0 text-[11px] text-faint">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </section>
    </div>
  );
}
