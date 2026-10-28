import type { Metadata } from "next";
import Link from "next/link";
import { ReadOnlyNote, SettingsSection } from "@/components/settings/section";
import { CreateWorkspaceForm, RenameWorkspaceForm } from "@/components/settings/workspace-forms";
import { Badge } from "@/components/ui/badge";
import { getCtx } from "@/lib/data/workspace";
import { getWorkspaceSettings, PLAN_LIMITS } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const ctx = await getCtx();
  const ws = await getWorkspaceSettings(ctx);
  const canManage = can(ctx.workspace.role, "workspace.manage");
  const plan = PLAN_LIMITS[ws.plan] ?? PLAN_LIMITS.pilot;
  const pct = ws.dailyLimit > 0 ? Math.min(100, Math.round((ws.runsToday / ws.dailyLimit) * 100)) : 100;
  return (
    <div>
      <SettingsSection title="Name" description={<>Shown in the command bar, reports and invitations. Created {formatDate(ws.createdAt)}.</>}>
        <div className="space-y-3">
          <RenameWorkspaceForm name={ws.name} canManage={canManage} />
          {!canManage && <ReadOnlyNote>Only admins and owners can rename the workspace. Your role: {ctx.workspace.role}.</ReadOnlyNote>}
          {ws.isDemo && <Badge tone="peach">Demonstration workspace</Badge>}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Research limit"
        description="Research runs are capped per rolling 24 hours to keep provider costs predictable. The limit is set per workspace during the pilot."
      >
        <div className="rounded-cc-lg border border-line bg-paper p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13px] text-muted">Runs in the last 24 hours</p>
            <p className="text-[13px]"><span className="text-2xl font-medium tracking-tight">{ws.runsToday}</span> <span className="text-muted">of {ws.dailyLimit}</span></p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/5" role="progressbar" aria-valuemin={0} aria-valuemax={ws.dailyLimit} aria-valuenow={ws.runsToday} aria-label="Research runs used in the last 24 hours">
            <div className={pct >= 100 ? "h-full bg-danger" : pct >= 80 ? "h-full bg-warning" : "h-full bg-violet"} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-[12px] text-muted">
            {plan.name} plan · published limit {plan.runsPerDay} runs/day. To change this workspace’s limit, contact us through{" "}
            <Link href="/help" className="text-ink underline underline-offset-2">Help &amp; feedback</Link>.
          </p>
          <p className="mt-1 text-[12px] text-muted">Data retention: {ws.retentionDays ? `${ws.retentionDays} days` : "kept until deleted"}.</p>
        </div>
      </SettingsSection>

      <SettingsSection title="Another workspace" description="Create a separate workspace for a different team or agency. Clients, campaigns and research never cross workspace boundaries.">
        <CreateWorkspaceForm />
      </SettingsSection>
    </div>
  );
}
