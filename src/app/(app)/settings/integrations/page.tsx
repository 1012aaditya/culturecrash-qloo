import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, CircleSlash, Database, FlaskConical, Globe, KeyRound, Mail, Sparkles } from "lucide-react";
import * as React from "react";
import { IntegrationControls } from "@/components/settings/integration-controls";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { getCtx } from "@/lib/data/workspace";
import { getIntegrationPrefs } from "@/lib/data/workspace-admin";
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
          title="Public web research"
          state={s.webResearch ? "configured" : "unavailable"}
          envVars={["(no provider supported yet)"]}
          details={[
            ["Status", "No web research provider is integrated in this build"],
            ["External sources", "added manually as evidence with URL and access date"],
          ]}
        />

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
      <p className="text-[12px] text-muted">
        Note: provider credentials come from the server configuration above. Turning Qloo off here blocks new live research runs in this workspace,
        and the default location is used as the location signal when a brief has no market. Turning the LLM off makes every draft in this workspace
        come from the labelled template engine, and no brief, evidence or document text is sent to the model provider.
      </p>
    </div>
  );
}
