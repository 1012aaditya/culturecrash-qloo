import type { Metadata } from "next";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import { NotificationForm } from "@/components/settings/notification-form";
import { SettingsSection } from "@/components/settings/section";
import { getProfileSettings } from "@/lib/data/workspace-admin";
import { getCtx } from "@/lib/data/workspace";
import { emailConfigured } from "@/lib/email";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const ctx = await getCtx();
  const profile = await getProfileSettings(ctx);
  return (
    <div>
      {!emailConfigured() && <div className="mb-2 flex gap-3 rounded-cc border border-line bg-paper p-4 text-[13px]">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="leading-relaxed text-muted">
          <span className="font-medium text-ink">Email delivery isn’t configured in this deployment.</span> Your choices are saved to your profile and
          will apply once an email provider is connected. Until then, research progress and finished tasks appear in the bell menu and the{" "}
          <Link href="/tasks" className="text-ink underline underline-offset-2">task center</Link>.
        </p>
      </div>}
      <SettingsSection title="Email notifications" description="Personal preferences — they apply to you in every workspace. Emails are only sent for the items you switch on.">
        <NotificationForm initial={profile.notifications} />
      </SettingsSection>
    </div>
  );
}
