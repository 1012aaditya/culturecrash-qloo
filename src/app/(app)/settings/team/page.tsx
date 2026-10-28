import type { Metadata } from "next";
import { SettingsSection } from "@/components/settings/section";
import { TeamManager } from "@/components/settings/team-manager";
import { getCtx } from "@/lib/data/workspace";
import { listInvitations, listMembers } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Team settings" };

const ROLES = [
  ["Owner", "Everything, including managing owners. Every workspace keeps at least one."],
  ["Admin", "Team, integrations, client deletion and brand approvals."],
  ["Member", "Campaigns, briefs, research, strategy, experiments and reports."],
  ["Viewer", "Read-only. Can export reports."],
];

export default async function TeamSettingsPage() {
  const ctx = await getCtx();
  const [members, invitations] = await Promise.all([listMembers(ctx), listInvitations(ctx)]);
  const canManage = can(ctx.workspace.role, "team.manage");
  return (
    <SettingsSection
      title="Team"
      description="Roles are enforced on the server and in the database, not just by hiding buttons."
      aside={
        <dl className="space-y-2.5 text-[12px]">
          {ROLES.map(([r, d]) => (
            <div key={r}>
              <dt className="font-medium text-ink">{r}</dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      }
    >
      <TeamManager members={members} invitations={invitations} canManage={canManage} myRole={ctx.workspace.role} myId={ctx.user.id} />
    </SettingsSection>
  );
}
