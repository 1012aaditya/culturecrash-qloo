import { TabRow } from "@/components/settings/tab-row";
import { getCtx } from "@/lib/data/workspace";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/billing", label: "Billing & usage" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/security", label: "Security & data" },
];

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const ctx = await getCtx();
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="cc-eyebrow text-muted">{ctx.workspace.name} · {ctx.workspace.role}</p>
          <h1 className="cc-display mt-3 text-4xl md:text-5xl">Settings</h1>
        </div>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted md:text-right">
          Personal settings apply to you everywhere. Workspace settings apply to <span className="text-ink">{ctx.workspace.name}</span>.
        </p>
      </header>
      <div className="sticky top-[76px] z-20 -mx-2 mt-4 rounded-full bg-ivory/85 px-2 py-1.5 backdrop-blur">
        <TabRow tabs={TABS} label="Settings sections" />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
