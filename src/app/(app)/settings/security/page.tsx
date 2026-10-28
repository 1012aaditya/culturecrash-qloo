import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { SettingsSection } from "@/components/settings/section";
import { DeleteAccount, ExportData, PasswordForm } from "@/components/settings/security-forms";
import { getCtx } from "@/lib/data/workspace";
import { soleOwnerBlockers } from "@/lib/data/workspace-admin";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Security & data" };

export default async function SecuritySettingsPage({ searchParams }: PageProps<"/settings/security">) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const mode = env().AUTH_MODE;
  // The recovery banner is informational; skipping the current password only applies to Supabase recovery sessions.
  const recovery = sp.recovery === "1";
  const { blocking } = await soleOwnerBlockers(ctx);

  return (
    <div>
      {recovery && (
        <div role="status" className="mb-2 flex gap-3 rounded-cc-lg border border-violet/25 bg-lilac/40 p-4 text-[13px]">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-violet-ink" />
          <p className="leading-relaxed">
            <span className="font-medium">You’re signed in from a password recovery link.</span>{" "}
            {mode === "supabase" ? "Choose a new password below — you don’t need your old one." : "Choose a new password below."}
          </p>
        </div>
      )}

      <SettingsSection
        title="Password"
        description={<>Signed in as <span className="text-ink">{ctx.user.email}</span>. {mode === "local" ? "Local development authentication." : "Managed by Supabase Auth."}</>}
      >
        <PasswordForm recovery={recovery && mode === "supabase"} />
      </SettingsSection>

      <SettingsSection
        title="Export your data"
        description="Download a JSON copy of the personal data linked to your account. Workspace records stay with their workspace."
      >
        <ExportData />
      </SettingsSection>

      <SettingsSection
        title="Delete account"
        description="Permanently removes your account. You can’t delete it while you are the only owner of a workspace that has other members."
      >
        <DeleteAccount email={ctx.user.email} mode={mode} blocking={blocking.map((b) => ({ name: b.name, members: b.members }))} />
      </SettingsSection>

      <SettingsSection title="How your data is protected" description="What this deployment enforces today.">
        <ul className="space-y-2 text-[13px] text-muted">
          {[
            "Every workspace table is protected by Postgres Row Level Security; the app queries as you, not as an administrator.",
            "Provider API keys stay in server environment variables and are never sent to your browser.",
            "Shared report links are read-only snapshots and can be revoked.",
            "Product analytics store event names and ids only, never brief or research content.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet" /> {t}</li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-faint">These controls don’t by themselves make CultureCrash compliant with any specific regulation.</p>
      </SettingsSection>
    </div>
  );
}
