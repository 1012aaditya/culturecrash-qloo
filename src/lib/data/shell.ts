import "server-only";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { ShellData } from "@/components/nav/types";
import { readNotifications } from "./notifications";
import type { Ctx } from "./workspace";

export async function getShellData(ctx: Ctx): Promise<ShellData> {
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const projects = await tx`select id, name, category, is_demo from projects where workspace_id = ${ws} and status <> 'archived' order by updated_at desc limit 30`;
    const tasks = await tx`select id, label, status, result_href, updated_at from background_tasks where workspace_id = ${ws} order by updated_at desc limit 8`;
    const notifications = await readNotifications(tx, ctx.user.id, ws);
    const people = await tx`select p.id, coalesce(p.full_name, p.email) as name from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = ${ws} order by m.created_at limit 8`;
    return {
      user: { name: ctx.profile.fullName ?? ctx.user.email, email: ctx.user.email },
      workspace: { id: ws, name: ctx.workspace.name, role: ctx.workspace.role, isDemo: ctx.workspace.isDemo },
      memberships: ctx.memberships.map((m) => ({ workspaceId: m.workspaceId, name: m.name, role: m.role })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, category: p.category, isDemo: p.is_demo })),
      tasks: tasks.map((t) => ({ id: t.id, label: t.label, status: t.status, href: t.result_href, updatedAt: new Date(t.updated_at).toISOString() })),
      notifications,
      collaborators: people.map((p) => ({ id: p.id, name: p.name })),
      can: {
        createProject: can(ctx.workspace.role, "project.create"),
        manageTeam: can(ctx.workspace.role, "team.manage"),
        runResearch: can(ctx.workspace.role, "research.run"),
        createReport: can(ctx.workspace.role, "report.create"),
        editExperiments: can(ctx.workspace.role, "experiment.edit"),
      },
    };
  });
}
