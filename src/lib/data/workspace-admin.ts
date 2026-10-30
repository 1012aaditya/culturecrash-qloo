import "server-only";
import { withUser } from "@/lib/db";
import { can, type Role } from "@/lib/permissions";
import type { Ctx } from "./workspace";

/**
 * Read models for the workspace, client, settings, task and activity pages.
 * Every query runs through withUser so RLS scopes the rows; workspace_id filters
 * additionally pin results to the active workspace.
 */

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// ---------------------------------------------------------------------------
// Plans (mirrors the published /pricing table; limits are pilot terms)
// ---------------------------------------------------------------------------
export const PLAN_LIMITS: Record<string, { name: string; seats: number | null; projects: number | null; clients: number | null; runsPerDay: number }> = {
  pilot: { name: "Pilot", seats: 3, projects: 3, clients: 1, runsPerDay: 25 },
  studio: { name: "Studio", seats: 10, projects: 25, clients: 10, runsPerDay: 75 },
  agency: { name: "Agency", seats: 35, projects: null, clients: null, runsPerDay: 200 },
};

export const USAGE_EVENT_LABEL: Record<string, string> = {
  project_created: "Campaigns created",
  brief_completed: "Briefs completed",
  research_run_started: "Research runs started",
  research_run_completed: "Research runs completed",
  research_run_failed: "Research runs failed",
  strategy_generated: "Strategies generated",
  strategy_selected: "Strategies selected",
  creative_brief_generated: "Creative briefs generated",
  experiment_created: "Experiments created",
  experiment_result_recorded: "Experiment results recorded",
  report_exported: "Reports exported",
  report_shared: "Reports shared",
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export type Member = { userId: string; name: string; email: string; jobTitle: string | null; role: Role; joinedAt: string };

export async function listMembers(ctx: Ctx): Promise<Member[]> {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select m.user_id, m.role, m.created_at, p.full_name, p.email, p.job_title
      from workspace_members m left join profiles p on p.id = m.user_id
      where m.workspace_id = ${ctx.workspace.workspaceId}
      order by workspace_role_rank(m.role) desc, m.created_at`;
    return rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name ?? r.email ?? "Unknown member",
      email: r.email ?? "",
      jobTitle: r.job_title,
      role: r.role,
      joinedAt: iso(r.created_at)!,
    }));
  });
}

export type Invitation = { id: string; email: string; role: Role; invitedBy: string | null; createdAt: string };

/** Pending invitations are visible to admins only (RLS returns nothing to others). */
export async function listInvitations(ctx: Ctx): Promise<Invitation[]> {
  if (!can(ctx.workspace.role, "team.manage")) return [];
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select i.id, i.email, i.role, i.created_at, coalesce(p.full_name, p.email) as invited_by
      from workspace_invitations i left join profiles p on p.id = i.invited_by
      where i.workspace_id = ${ctx.workspace.workspaceId} and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
      order by i.created_at desc`;
    return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, invitedBy: r.invited_by, createdAt: iso(r.created_at)! }));
  });
}

export type MyInvitation = { id: string; workspaceName: string; role: Role; invitedBy: string | null; createdAt: string };

/** Invitations addressed to the signed-in user's confirmed email, waiting for them to accept. */
export async function listMyInvitations(ctx: Ctx): Promise<MyInvitation[]> {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`select id, workspace_name, role, invited_by, created_at from public.my_pending_invitations()`;
    return rows.map((r) => ({ id: r.id, workspaceName: r.workspace_name, role: r.role, invitedBy: r.invited_by, createdAt: iso(r.created_at)! }));
  });
}

// ---------------------------------------------------------------------------
// Workspace overview
// ---------------------------------------------------------------------------
export async function getWorkspaceOverview(ctx: Ctx) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [workspace] = await tx`select name, plan, research_runs_daily_limit, created_at from workspaces where id = ${ws}`;
    const [counts] = await tx`
      select
        (select count(*) from clients where workspace_id = ${ws})::int as clients,
        (select count(*) from projects where workspace_id = ${ws} and status = 'active')::int as active_projects,
        (select count(*) from projects where workspace_id = ${ws} and status = 'draft')::int as draft_projects,
        (select count(*) from projects where workspace_id = ${ws} and status = 'archived')::int as archived_projects,
        (select count(*) from reports where workspace_id = ${ws})::int as reports,
        (select count(*) from background_tasks where workspace_id = ${ws} and status in ('queued','running'))::int as running_tasks`;
    const usage = await tx`
      select event, count(*)::int as n from usage_events
      where workspace_id = ${ws} and created_at >= date_trunc('month', now())
      group by event order by n desc`;
    const projects = await tx`
      select p.id, p.name, p.category, p.status, p.is_demo, p.updated_at, c.name as client_name
      from projects p left join clients c on c.id = p.client_id
      where p.workspace_id = ${ws} and p.status <> 'archived' order by p.updated_at desc limit 6`;
    const clients = await tx`
      select c.id, c.name, c.industry,
        (select count(*) from projects p where p.client_id = c.id)::int as project_count,
        (select b.approval_status from brand_profiles b where b.client_id = c.id) as brand_status
      from clients c where c.workspace_id = ${ws} order by c.updated_at desc limit 5`;
    const activity = await tx`
      select a.id, a.summary, a.created_at, a.project_id, pj.name as project, coalesce(pr.full_name, pr.email, 'Someone') as actor
      from activity_events a left join profiles pr on pr.id = a.actor_id left join projects pj on pj.id = a.project_id
      where a.workspace_id = ${ws} order by a.created_at desc limit 8`;
    return {
      workspace: { name: workspace?.name as string, plan: workspace?.plan as string, dailyLimit: workspace?.research_runs_daily_limit as number, createdAt: iso(workspace?.created_at) },
      counts: counts as { clients: number; active_projects: number; draft_projects: number; archived_projects: number; reports: number; running_tasks: number },
      usage: usage.map((u) => ({ event: u.event as string, count: u.n as number })),
      projects: projects.map((p) => ({ id: p.id as string, name: p.name as string, category: p.category as string | null, status: p.status as string, isDemo: p.is_demo as boolean, updatedAt: iso(p.updated_at)!, clientName: p.client_name as string | null })),
      clients: clients.map((c) => ({ id: c.id as string, name: c.name as string, industry: c.industry as string | null, projectCount: c.project_count as number, brandStatus: c.brand_status as string | null })),
      activity: activity.map((a) => ({ id: a.id as string, summary: a.summary as string, createdAt: iso(a.created_at)!, projectId: a.project_id as string | null, project: a.project as string | null, actor: a.actor as string })),
    };
  });
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export type ClientSummary = {
  id: string; name: string; industry: string | null; website: string | null; notes: string | null;
  projectCount: number; activeProjectCount: number; brandStatus: "draft" | "approved" | null; updatedAt: string; createdAt: string;
};

export async function listClients(ctx: Ctx): Promise<ClientSummary[]> {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select c.id, c.name, c.industry, c.website, c.notes, c.created_at, c.updated_at,
        (select count(*) from projects p where p.client_id = c.id)::int as project_count,
        (select count(*) from projects p where p.client_id = c.id and p.status <> 'archived')::int as active_count,
        (select b.approval_status from brand_profiles b where b.client_id = c.id) as brand_status
      from clients c where c.workspace_id = ${ctx.workspace.workspaceId}
      order by c.updated_at desc`;
    return rows.map((r) => ({
      id: r.id, name: r.name, industry: r.industry, website: r.website, notes: r.notes,
      projectCount: r.project_count, activeProjectCount: r.active_count, brandStatus: r.brand_status,
      updatedAt: iso(r.updated_at)!, createdAt: iso(r.created_at)!,
    }));
  });
}

export async function getClientWorkspace(ctx: Ctx, clientId: string) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [c] = await tx`
      select c.id, c.name, c.industry, c.website, c.notes, c.created_at, c.updated_at, coalesce(p.full_name, p.email) as created_by
      from clients c left join profiles p on p.id = c.created_by
      where c.id = ${clientId} and c.workspace_id = ${ws}`;
    if (!c) return null;
    const projects = await tx`
      select p.id, p.name, p.category, p.market, p.status, p.is_demo, p.updated_at,
        (select r.status from research_runs r where r.project_id = p.id order by r.created_at desc limit 1) as last_run_status
      from projects p where p.client_id = ${clientId} and p.workspace_id = ${ws} order by p.updated_at desc`;
    const reports = await tx`
      select r.id, r.title, r.updated_at, r.project_id, p.name as project,
        (select max(v.version) from report_versions v where v.report_id = r.id) as version
      from reports r join projects p on p.id = r.project_id
      where p.client_id = ${clientId} and r.workspace_id = ${ws} order by r.updated_at desc limit 20`;
    const activity = await tx`
      select a.id, a.summary, a.created_at, a.project_id, pj.name as project, coalesce(pr.full_name, pr.email, 'Someone') as actor
      from activity_events a left join profiles pr on pr.id = a.actor_id left join projects pj on pj.id = a.project_id
      where a.workspace_id = ${ws} and (pj.client_id = ${clientId} or a.object_id = ${clientId})
      order by a.created_at desc limit 15`;
    const [brand] = await tx`select approval_status, approved_at, updated_at from brand_profiles where client_id = ${clientId}`;
    return {
      client: { id: c.id as string, name: c.name as string, industry: c.industry as string | null, website: c.website as string | null, notes: c.notes as string | null, createdAt: iso(c.created_at)!, updatedAt: iso(c.updated_at)!, createdBy: c.created_by as string | null },
      projects: projects.map((p) => ({ id: p.id as string, name: p.name as string, category: p.category as string | null, market: p.market as string | null, status: p.status as string, isDemo: p.is_demo as boolean, updatedAt: iso(p.updated_at)!, lastRunStatus: p.last_run_status as string | null })),
      reports: reports.map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: iso(r.updated_at)!, projectId: r.project_id as string, project: r.project as string, version: (r.version as number | null) ?? null })),
      activity: activity.map((a) => ({ id: a.id as string, summary: a.summary as string, createdAt: iso(a.created_at)!, project: a.project as string | null, actor: a.actor as string })),
      brand: brand ? { status: brand.approval_status as "draft" | "approved", approvedAt: iso(brand.approved_at), updatedAt: iso(brand.updated_at)! } : null,
    };
  });
}

export type BrandProfile = {
  guidelines: string; approvedMessaging: string; positioning: string; audienceDefinitions: string; priorDecisions: string;
  status: "draft" | "approved"; approvedBy: string | null; approvedAt: string | null; updatedBy: string | null; updatedAt: string | null;
};

export async function getBrandMemory(ctx: Ctx, clientId: string) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [c] = await tx`select id, name, industry from clients where id = ${clientId} and workspace_id = ${ws}`;
    if (!c) return null;
    const [b] = await tx`
      select b.*, coalesce(ap.full_name, ap.email) as approver, coalesce(up.full_name, up.email) as updater
      from brand_profiles b left join profiles ap on ap.id = b.approved_by left join profiles up on up.id = b.updated_by
      where b.client_id = ${clientId} and b.workspace_id = ${ws}`;
    const brand: BrandProfile = {
      guidelines: b?.guidelines ?? "",
      approvedMessaging: b?.approved_messaging ?? "",
      positioning: b?.positioning ?? "",
      audienceDefinitions: b?.audience_definitions ?? "",
      priorDecisions: b?.prior_decisions ?? "",
      status: (b?.approval_status as "draft" | "approved") ?? "draft",
      approvedBy: b?.approver ?? null,
      approvedAt: iso(b?.approved_at),
      updatedBy: b?.updater ?? null,
      updatedAt: iso(b?.updated_at),
    };
    return { client: { id: c.id as string, name: c.name as string, industry: c.industry as string | null }, brand, exists: Boolean(b) };
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
export const ACTIVITY_PAGE_SIZE = 30;

export async function listActivity(ctx: Ctx, opts: { page: number; projectId: string | null }) {
  const ws = ctx.workspace.workspaceId;
  const offset = (Math.max(1, opts.page) - 1) * ACTIVITY_PAGE_SIZE;
  return withUser(ctx.user.id, async (tx) => {
    const filter = opts.projectId ? tx`and a.project_id = ${opts.projectId}` : tx``;
    const [{ total }] = await tx`select count(*)::int as total from activity_events a where a.workspace_id = ${ws} ${filter}`;
    const rows = await tx`
      select a.id, a.verb, a.object_type, a.summary, a.created_at, a.project_id, pj.name as project,
        coalesce(pr.full_name, pr.email, 'Someone') as actor
      from activity_events a left join profiles pr on pr.id = a.actor_id left join projects pj on pj.id = a.project_id
      where a.workspace_id = ${ws} ${filter}
      order by a.created_at desc limit ${ACTIVITY_PAGE_SIZE} offset ${offset}`;
    const projects = await tx`select id, name from projects where workspace_id = ${ws} order by name`;
    return {
      total: total as number,
      rows: rows.map((r) => ({ id: r.id as string, verb: r.verb as string, objectType: r.object_type as string, summary: r.summary as string, createdAt: iso(r.created_at)!, projectId: r.project_id as string | null, project: r.project as string | null, actor: r.actor as string })),
      projects: projects.map((p) => ({ id: p.id as string, name: p.name as string })),
    };
  });
}

// ---------------------------------------------------------------------------
// Background tasks
// ---------------------------------------------------------------------------
export type TaskRow = {
  id: string; kind: string; label: string; status: "queued" | "running" | "completed" | "failed" | "awaiting_review";
  projectId: string | null; project: string | null; resultHref: string | null; error: string | null; attempts: number;
  startedAt: string | null; finishedAt: string | null; createdAt: string; updatedAt: string; createdBy: string | null;
};

export async function listTasks(ctx: Ctx, status: string | null): Promise<TaskRow[]> {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const filter = status ? tx`and t.status = ${status}` : tx``;
    const rows = await tx`
      select t.*, p.name as project, coalesce(pr.full_name, pr.email) as creator
      from background_tasks t left join projects p on p.id = t.project_id left join profiles pr on pr.id = t.created_by
      where t.workspace_id = ${ws} ${filter}
      order by (t.status in ('queued','running')) desc, t.updated_at desc limit 100`;
    return rows.map((r) => ({
      id: r.id, kind: r.kind, label: r.label, status: r.status, projectId: r.project_id, project: r.project,
      resultHref: r.result_href, error: r.error_message, attempts: r.attempts,
      startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, createdBy: r.creator,
    }));
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const NOTIFICATION_KEYS = ["research_completed", "report_shared", "weekly_digest"] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export async function getProfileSettings(ctx: Ctx) {
  return withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select full_name, job_title, email, notification_prefs, created_at from profiles where id = ${ctx.user.id}`;
    const prefs = (p?.notification_prefs ?? {}) as Record<string, unknown>;
    return {
      fullName: (p?.full_name as string | null) ?? "",
      jobTitle: (p?.job_title as string | null) ?? "",
      email: (p?.email as string | undefined) ?? ctx.user.email,
      createdAt: iso(p?.created_at),
      notifications: Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, prefs[k] === true])) as Record<NotificationKey, boolean>,
    };
  });
}

export async function getWorkspaceSettings(ctx: Ctx) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [w] = await tx`select name, plan, is_demo, research_runs_daily_limit, data_retention_days, created_at, research_budget_usd_monthly, research_runs_per_user_daily from workspaces where id = ${ws}`;
    const [{ today }] = await tx`select research_runs_today(${ws}) as today`;
    const [{ spent }] = await tx`select research_spend_this_month(${ws}) as spent`;
    return {
      name: w.name as string, plan: w.plan as string, isDemo: w.is_demo as boolean, dailyLimit: w.research_runs_daily_limit as number,
      retentionDays: w.data_retention_days as number | null, createdAt: iso(w.created_at)!, runsToday: today as number,
      budgetUsd: Number(w.research_budget_usd_monthly), perUserDaily: w.research_runs_per_user_daily as number, spentUsd: Number(spent),
    };
  });
}

export type IntegrationPref = { enabled: boolean; config: Record<string, unknown>; updatedAt: string | null; updatedBy: string | null };

export async function getIntegrationPrefs(ctx: Ctx): Promise<Record<"qloo" | "llm" | "web_research", IntegrationPref>> {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select s.provider, s.enabled, s.config, s.updated_at, coalesce(p.full_name, p.email) as updater
      from integration_settings s left join profiles p on p.id = s.updated_by
      where s.workspace_id = ${ctx.workspace.workspaceId}`;
    const base = (): IntegrationPref => ({ enabled: true, config: {}, updatedAt: null, updatedBy: null });
    const out = { qloo: base(), llm: base(), web_research: base() };
    for (const r of rows) {
      out[r.provider as keyof typeof out] = { enabled: r.enabled, config: (r.config ?? {}) as Record<string, unknown>, updatedAt: iso(r.updated_at), updatedBy: r.updater };
    }
    return out;
  });
}

export async function getBillingUsage(ctx: Ctx) {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [w] = await tx`select plan, research_runs_daily_limit from workspaces where id = ${ws}`;
    const events = await tx`
      select event, count(*)::int as n from usage_events
      where workspace_id = ${ws} and created_at > now() - interval '30 days' group by event order by n desc`;
    const runs = await tx`
      select status, mode, count(*)::int as n from research_runs
      where workspace_id = ${ws} and created_at > now() - interval '30 days' group by status, mode`;
    const [{ today }] = await tx`select research_runs_today(${ws}) as today`;
    const [counts] = await tx`
      select (select count(*) from workspace_members where workspace_id = ${ws})::int as seats,
        (select count(*) from projects where workspace_id = ${ws} and status <> 'archived')::int as projects,
        (select count(*) from clients where workspace_id = ${ws})::int as clients`;
    return {
      plan: w.plan as string,
      dailyLimit: w.research_runs_daily_limit as number,
      runsToday: today as number,
      events: events.map((e) => ({ event: e.event as string, count: e.n as number })),
      runs: runs.map((r) => ({ status: r.status as string, mode: r.mode as string, count: r.n as number })),
      seats: counts.seats as number,
      projects: counts.projects as number,
      clients: counts.clients as number,
    };
  });
}

/** Workspaces where this user is the only owner while other people are still members. */
export async function soleOwnerBlockers(ctx: Ctx) {
  return withUser(ctx.user.id, async (tx) => {
    const rows = await tx`
      select w.id, w.name,
        (select count(*) from workspace_members x where x.workspace_id = w.id)::int as members
      from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = ${ctx.user.id} and m.role = 'owner'
        and not exists (select 1 from workspace_members o where o.workspace_id = w.id and o.role = 'owner' and o.user_id <> ${ctx.user.id})`;
    return {
      blocking: rows.filter((r) => r.members > 1).map((r) => ({ id: r.id as string, name: r.name as string, members: r.members as number })),
      soloOwned: rows.filter((r) => r.members <= 1).map((r) => ({ id: r.id as string, name: r.name as string })),
    };
  });
}
