import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, CircleSlash, Database, FlaskConical, Globe, KeyRound, Mail, Sparkles } from "lucide-react";
import * as React from "react";
import { IntegrationControls } from "@/components/settings/integration-controls";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { getCtx } from "@/lib/data/workspace";
import { getIntegrationPrefs } from "@/lib/data/workspace-admin";
import { withUser } from "@/lib/db";
import { providerHealth, type ProviderHealth } from "@/lib/research/deep/health";
import { providerRegistry } from "@/lib/research/deep/registry";
import { env, integrationStatus, maskSecret } from "@/lib/env";
import { can } from "@/lib/permissions";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrations" };

type State = "configured" | "enabled" | "missing" | "unavailable" | "off";

const MONO = new Set(["Host", "API key", "Model", "Database host", "Supabase host"]);

function hostOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host; // never includes credentials
  } catch {
    return null;
  }
}

function StateBadge({ state }: { state: State }) {
  if (state === "configured") return <Badge tone="success"><CheckCircle2 /> Configured</Badge>;
  if (state === "enabled") return <Badge tone="peach"><CheckCircle2 /> Enabled</Badge>;
  if (state === "missing") return <Badge tone="warning"><CircleDashed /> Not configured</Badge>;
  if (state === "off") return <Badge tone="outline"><CircleSlash /> Off</Badge>;
  return <Badge tone="outline"><CircleSlash /> Not available in this build</Badge>;
}

function Card({
  icon: Icon, title, state, children, className, details, envVars,
}: {
  icon: React.ComponentType<{ className?: string }>; title: string; state: State; children?: React.ReactNode; className?: string;
  details: [string, React.ReactNode][]; envVars: string[];
}) {
  return (
    <Surface className={cn("flex flex-col gap-4 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 items-center justify-center rounded-full", state === "configured" || state === "enabled" ? "bg-lilac/70 text-violet-ink" : "bg-ink/5 text-muted")}>
            <Icon className="size-[18px]" />
          </span>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        </div>
        <StateBadge state={state} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {details.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className={cn("min-w-0 break-words leading-5", MONO.has(k) ? "font-mono text-[12px]" : "text-ink")}>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-[12px] leading-relaxed text-muted">
        Server environment {envVars.length === 1 ? "variable" : "variables"}: {envVars.map((v, i) => (
          <React.Fragment key={v}>{i > 0 && ", "}<code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[11px] text-ink">{v}</code></React.Fragment>
        ))}
      </p>
      {children}
    </Surface>
  );
}

export default async function IntegrationsPage() {
  const ctx = await getCtx();
  const s = integrationStatus();
  const e = env();
  const prefs = await getIntegrationPrefs(ctx);
  const research = providerRegistry();
  const health = await withUser(ctx.user.id, (tx) => providerHealth(tx, ctx.workspace.workspaceId));
  const healthRows = [{ key: "qloo", label: "Qloo Insights", configured: s.qloo }, ...research.map((p) => ({ key: p.key, label: p.label, configured: p.configured }))];
  const canManage = can(ctx.workspace.role, "integrations.manage");
  // Masked suffixes are diagnostics for admins only; full secrets never leave the server.
  const masked = (v: string | undefined) => (canManage ? maskSecret(v) ?? "—" : v ? "set (visible to admins)" : "—");
  const changed = (p: { updatedAt: string | null; updatedBy: string | null }) =>
    p.updatedAt ? <p className="text-[11px] text-faint">Preference last changed {formatDateTime(p.updatedAt)}{p.updatedBy ? ` by ${p.updatedBy}` : ""}</p> : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-cc-lg border border-line bg-paper/60 p-5 text-[13px] leading-relaxed text-muted md:grid-cols-[auto_1fr]">
        <KeyRound className="size-5 text-violet" />
        <p>
          Provider credentials live only in server environment variables and are never sent to the browser or stored in the database.
          This page reports what the server can see right now — a provider shows as configured only when its key is present.
          To connect one, set the variable in your hosting provider (or <code className="font-mono text-[12px] text-ink">.env.local</code>) and redeploy.
          Workspace switches below are non-secret preferences.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card
          className="lg:col-span-7"
          icon={Sparkles}
          title="Qloo Insights API"
          state={s.qloo ? "configured" : "missing"}
          envVars={["QLOO_API_KEY", "QLOO_API_URL"]}
          details={[
            ["Host", s.qlooHost],
            ["API key", masked(e.QLOO_API_KEY)],
            ["Live research", s.qloo ? "available" : "unavailable until a key is set"],
          ]}
        >
          <IntegrationControls provider="qloo" enabled={prefs.qloo.enabled} defaultLocation={typeof prefs.qloo.config.defaultLocation === "string" ? prefs.qloo.config.defaultLocation : ""} canManage={canManage} />
          {changed(prefs.qloo)}
        </Card>

        <Card
          className="lg:col-span-5"
          icon={Sparkles}
          title="LLM provider (Anthropic)"
          state={s.llm ? "configured" : "missing"}
          envVars={["ANTHROPIC_API_KEY", "LLM_MODEL"]}
          details={[
            ["Model", s.llmModel],
            ["API key", masked(e.ANTHROPIC_API_KEY)],
            ["Without a key, or switched off", "labelled template drafts, no model calls"],
          ]}
        >
          <IntegrationControls provider="llm" enabled={prefs.llm.enabled} canManage={canManage} />
          {changed(prefs.llm)}
        </Card>

        <Card
          className="lg:col-span-5"
          icon={Globe}
          title="Web, video & community research"
          state={research.some((p) => p.configured && p.key !== "wikipedia" && p.key !== "brand_docs") ? "configured" : "missing"}
          envVars={["BRAVE_API_KEY", "YOUTUBE_API_KEY", "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_COMMERCIAL_ACCESS"]}
          details={research.filter((p) => p.key !== "brand_docs").map((p) => [p.label, p.configured ? `available · ${p.costModel}${p.verified === "contract_only" ? " · not yet verified live" : ""}` : (p.unavailableReason ?? "not configured")] as [string, string])}
        >
          <IntegrationControls provider="web_research" enabled={prefs.web_research.enabled} canManage={canManage} />
          {changed(prefs.web_research)}
        </Card>

        <Card
          className="lg:col-span-12"
          icon={Mail}
          title="Email delivery (Resend)"
          state={s.email ? "configured" : "missing"}
          envVars={["RESEND_API_KEY", "EMAIL_FROM", "PILOT_NOTIFY_EMAIL"]}
          details={[
            ["API key", masked(e.RESEND_API_KEY)],
            ["Sender", e.EMAIL_FROM ?? "not configured"],
            ["Sends", "team invitations; research finished and report shared (when the recipient opted in); weekly digest"],
            ["Without a key", "nothing is emailed; invitations are recorded and the app says so"],
          ]}
        />

        <Card
          className="lg:col-span-7"
          icon={Database}
          title="Database & authentication"
          state={s.database && s.auth ? "configured" : "missing"}
          envVars={s.authMode === "local" ? ["DATABASE_URL", "AUTH_MODE", "SESSION_SECRET"] : ["DATABASE_URL", "AUTH_MODE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
          details={[
            ["Database host", hostOf(e.DATABASE_URL) ?? "not configured"],
            ["Auth mode", s.authMode === "local" ? "local (development only)" : "Supabase Auth"],
            ...(s.authMode === "supabase" ? ([["Supabase host", hostOf(e.NEXT_PUBLIC_SUPABASE_URL) ?? "not configured"]] as [string, string][]) : []),
            ["File storage", s.storage ? `Supabase Storage · ${e.SUPABASE_STORAGE_BUCKET}` : "not configured (text is extracted, files not kept)"],
            ["Row Level Security", "enforced on every workspace table"],
          ]}
        />

        <Card
          className="lg:col-span-12"
          icon={FlaskConical}
          title="Demonstration mode"
          state={s.demoMode ? "enabled" : "off"}
          envVars={["CC_DEMO_MODE"]}
          details={[
            ["Status", s.demoMode ? "enabled — fixture research runs are allowed and always labelled “Demonstration data”" : "disabled — only live provider data is used"],
            ["Production", "always disabled on production deployments"],
          ]}
        />
      </div>
      <ProviderHealthTable rows={healthRows} health={health} />
      <p className="text-[12px] text-muted">
        Note: provider credentials come from the server configuration above. Turning Qloo off here blocks new live research runs in this workspace,
        and the default location is used as the location signal when a brief has no market. Turning web research off keeps every research job to Qloo and
        your own client documents — no brief details are sent to search, video or community providers. Turning the LLM off makes every draft in this workspace
        come from the labelled template engine, and no brief, evidence or document text is sent to the model provider.
      </p>
    </div>
  );
}

/** Measured, separate states per provider — a configured key is not shown as a working integration. */
function ProviderHealthTable({ rows, health }: { rows: { key: string; label: string; configured: boolean }[]; health: Map<string, ProviderHealth> }) {
  const mark = (v: boolean | null, title: string) => (
    <span title={title} className={cn("inline-block size-2.5 rounded-full", v === true ? "bg-success" : v === false ? "bg-danger" : "bg-ink/15")} aria-label={`${title}: ${v === true ? "yes" : v === false ? "no" : "not yet observed"}`} />
  );
  return (
    <Surface className="overflow-x-auto p-5">
      <h2 className="text-[14px] font-semibold">Provider health</h2>
      <p className="mt-1 text-[12px] text-muted">Measured from this workspace’s research calls in the last 30 days. Each column is a separate check — green means observed, red means it failed, grey means not observed yet.</p>
      <table className="mt-4 w-full min-w-[860px] text-left text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted">
          <tr>{["Provider", "Configured", "Auth", "Reachable", "Succeeded", "Data", "Valid", "Used in reports", "Requests", "Last success", "Last error", "Latency", "Est. cost"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const h = health.get(r.key) ?? (r.key === "qloo" ? health.get("qloo") : undefined);
            return (
              <tr key={r.key}>
                <td className="py-2 pr-3 font-medium">{r.label}</td>
                <td className="pr-3">{mark(r.configured, "Credentials configured")}</td>
                <td className="pr-3">{mark(h ? h.authVerified : null, "Authentication verified")}</td>
                <td className="pr-3">{mark(h ? (h.reachable ? true : h.requests ? false : null) : null, "Endpoint reachable")}</td>
                <td className="pr-3">{mark(h ? (h.succeeded > 0 ? true : h.requests ? false : null) : null, "A request succeeded")}</td>
                <td className="pr-3">{mark(h ? (h.dataReturned > 0 ? true : h.succeeded ? false : null) : null, "Data returned")}</td>
                <td className="pr-3">{mark(h ? (h.validationFailures === 0 && h.succeeded > 0 ? true : h.validationFailures ? false : null) : null, "Response passed validation")}</td>
                <td className="pr-3">{mark(h ? (h.usedInReports > 0 ? true : null) : null, "Used in a report")}{h?.usedInReports ? <span className="ml-1 text-muted">{h.usedInReports}</span> : null}</td>
                <td className="pr-3 tabular-nums">{h?.requests ?? 0}{h?.rateLimited ? <span className="text-warning"> · {h.rateLimited}×429</span> : null}</td>
                <td className="pr-3 text-muted">{h?.lastSuccessAt ? formatDateTime(h.lastSuccessAt) : "—"}</td>
                <td className="max-w-[200px] truncate pr-3 text-muted" title={h?.lastError?.message}>{h?.lastError ? `${h.lastError.category} · ${formatDateTime(h.lastError.at)}` : "—"}</td>
                <td className="pr-3 tabular-nums text-muted">{h?.avgLatencyMs != null ? `${h.avgLatencyMs} ms` : "—"}</td>
                <td className="tabular-nums text-muted">{h ? `$${h.usdEstimated.toFixed(3)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Surface>
  );
}
