import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";
import { SettingsSection } from "@/components/settings/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCtx } from "@/lib/data/workspace";
import { getBillingUsage, PLAN_LIMITS, USAGE_EVENT_LABEL } from "@/lib/data/workspace-admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing & usage" };

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note?: string }) {
  const pct = limit ? Math.min(100, Math.round((used / Math.max(limit, 1)) * 100)) : 0;
  const over = limit !== null && used > limit;
  return (
    <div className="rounded-cc border border-line bg-paper p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1 text-[13px]">
        <span className={cn("text-2xl font-medium tracking-tight", over && "text-danger")}>{used}</span>
        <span className="text-muted"> {limit === null ? "· unlimited" : `of ${limit}`}</span>
      </p>
      {limit !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/5" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <div className={cn("h-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-violet")} style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-faint">{note}</p>}
    </div>
  );
}

export default async function BillingPage() {
  const ctx = await getCtx();
  const u = await getBillingUsage(ctx);
  const plan = PLAN_LIMITS[u.plan] ?? PLAN_LIMITS.pilot;
  const runs30 = u.runs.reduce((n, r) => n + r.count, 0);
  const by = (pred: (r: { status: string; mode: string }) => boolean) => u.runs.filter(pred).reduce((n, r) => n + r.count, 0);

  return (
    <div>
      <div className="mb-2 flex flex-col gap-4 rounded-cc-lg border border-line bg-paper p-5 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-peach/40 text-[#8a3d22]"><CreditCard className="size-[18px]" /></span>
        <div className="flex-1 text-[13px] leading-relaxed">
          <p className="font-medium">Payments are not configured.</p>
          <p className="text-muted">
            CultureCrash is currently offered as a free pilot. No card is collected and no charge will be made; prices will be published before any
            billing starts, and nobody is moved to a paid plan without agreeing to it.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/pricing#pilot">Pilot terms <ArrowRight /></Link></Button>
      </div>

      <SettingsSection title="Plan" description="Plans describe the intended limits. During the pilot we set limits per workspace with you.">
        <div className="flex flex-wrap items-center gap-3 rounded-cc-lg border border-line bg-paper p-5">
          <p className="cc-display text-4xl">{plan.name}</p>
          <Badge tone="peach">Pilot terms · no charge</Badge>
          <Link href="/pricing" className="ml-auto text-[13px] text-muted hover:text-ink">Compare plans →</Link>
        </div>
      </SettingsSection>

      <SettingsSection title="Limits" description="Current usage against this workspace’s limits.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meter label="Research runs · last 24 h" used={u.runsToday} limit={u.dailyLimit} note="Enforced when a run starts" />
          <Meter label="Seats" used={u.seats} limit={plan.seats} note="Members, all roles" />
          <Meter label="Active campaigns" used={u.projects} limit={plan.projects} note="Archived campaigns don’t count" />
          <Meter label="Clients" used={u.clients} limit={plan.clients} />
        </div>
        <p className="mt-3 text-[12px] text-muted">Only the research-run limit is enforced automatically today. Seat, campaign and client limits are shown for planning.</p>
      </SettingsSection>

      <SettingsSection title="Usage · last 30 days" description="Counted from recorded product events and research runs. Event names and ids only — never brief content.">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-cc-lg border border-line bg-paper p-5">
            <p className="text-[12px] text-muted">Research runs</p>
            <p className="mt-1 text-3xl font-medium tracking-tight">{runs30}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-muted">Live</dt><dd className="font-medium">{by((r) => r.mode === "live")}</dd></div>
              <div><dt className="text-muted">Demonstration</dt><dd className="font-medium">{by((r) => r.mode === "demo")}</dd></div>
              <div><dt className="text-muted">Completed</dt><dd className="font-medium">{by((r) => r.status === "completed")}</dd></div>
              <div><dt className="text-muted">Failed</dt><dd className="font-medium">{by((r) => r.status === "failed")}</dd></div>
            </dl>
          </div>
          <div className="rounded-cc-lg border border-line bg-paper p-5">
            <p className="text-[12px] text-muted">Product events</p>
            {u.events.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">No usage recorded in the last 30 days.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line text-[13px]">
                {u.events.map((e) => (
                  <li key={e.event} className="flex justify-between py-2">
                    <span>{USAGE_EVENT_LABEL[e.event] ?? e.event.replace(/_/g, " ")}</span>
                    <span className="font-medium tabular-nums">{e.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
