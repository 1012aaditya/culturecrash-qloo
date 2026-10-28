import type { Metadata } from "next";
import { Avatar } from "@/components/nav/avatar";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsSection } from "@/components/settings/section";
import { Badge } from "@/components/ui/badge";
import { getProfileSettings } from "@/lib/data/workspace-admin";
import { getCtx } from "@/lib/data/workspace";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const ctx = await getCtx();
  const profile = await getProfileSettings(ctx);
  const display = profile.fullName || profile.email;
  return (
    <div>
      <SettingsSection
        title="Your profile"
        description="How you appear to teammates in activity history, comments and the team list."
        aside={
          <div className="flex items-center gap-3">
            <Avatar name={display} className="size-12 border-0 text-[14px]" />
            <div className="text-[12px] text-muted">
              <p className="text-[13px] font-medium text-ink">{display}</p>
              Member since {formatDate(profile.createdAt)}
            </div>
          </div>
        }
      >
        <ProfileForm initial={{ fullName: profile.fullName, jobTitle: profile.jobTitle, email: profile.email }} />
      </SettingsSection>
      <SettingsSection title="Workspaces" description="Your role in each workspace you belong to. Switch workspace from the account menu in the command bar.">
        <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
          {ctx.memberships.map((m) => (
            <li key={m.workspaceId} className="flex items-center justify-between gap-3 p-3.5 text-[14px]">
              <span className="min-w-0 truncate">
                {m.name}
                {m.workspaceId === ctx.workspace.workspaceId && <span className="ml-2 text-[12px] text-muted">current</span>}
              </span>
              <span className="flex items-center gap-2">
                {m.isDemo && <Badge tone="peach">demo</Badge>}
                <Badge tone={m.role === "owner" ? "dark" : m.role === "admin" ? "violet" : "outline"}>{m.role}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
