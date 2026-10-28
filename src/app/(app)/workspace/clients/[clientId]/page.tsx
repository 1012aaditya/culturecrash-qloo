import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, FileText, FolderOpen, Plus } from "lucide-react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { DemoBadge, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, Surface } from "@/components/ui/surface";
import { ClientDetailsForm, DeleteClientButton } from "@/components/workspace/client-forms";
import { ClientHeader } from "@/components/workspace/client-header";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { getClientWorkspace } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Client workspace" };

export default async function ClientWorkspacePage({ params }: PageProps<"/workspace/clients/[clientId]">) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const ctx = await getCtx();
  const data = await getClientWorkspace(ctx, clientId);
  if (!data) notFound();
  const { client, projects, reports, activity, brand } = data;
  const canEdit = can(ctx.workspace.role, "client.edit");
  const canDelete = can(ctx.workspace.role, "data.delete");

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <ClientHeader
        client={client}
        eyebrow={<>Client{client.industry ? ` · ${client.industry}` : ""} · added {formatDate(client.createdAt)}</>}
        actions={
          <>
            {can(ctx.workspace.role, "project.create") && <Button asChild variant="outline"><Link href="/projects/new"><Plus /> New campaign</Link></Button>}
            {canDelete && <DeleteClientButton clientId={client.id} name={client.name} projectCount={projects.length} redirectTo="/workspace/clients" />}
          </>
        }
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <Surface className="p-6">
            <SectionTitle eyebrow="Campaign history" title={`${projects.length} ${projects.length === 1 ? "campaign" : "campaigns"}`} />
            {projects.length === 0 ? (
              <EmptyState
                className="mt-4 p-5"
                icon={FolderOpen}
                title="No campaigns for this client yet"
                body="When you create a campaign, choose this client so its research and reports are filed here."
              />
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="group flex h-full gap-3 rounded-cc border border-line p-2.5 transition-shadow hover:shadow-card">
                      <ArtPlate theme={themeForCategory(p.category)} seed={p.id} className="size-16 shrink-0" />
                      <span className="min-w-0 py-0.5">
                        <span className="block truncate text-[14px] font-medium group-hover:text-violet">{p.name}</span>
                        <span className="block truncate text-[12px] text-muted">{[p.category, p.market].filter(Boolean).join(" · ") || "Category not set"}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                          <Badge tone={p.status === "active" ? "violet" : "outline"}>{p.status}</Badge>
                          {p.lastRunStatus && <span>research {p.lastRunStatus}</span>}
                          <span>· {timeAgo(p.updatedAt)}</span>
                          {p.isDemo && <DemoBadge label="Demo" />}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface className="p-6">
            <SectionTitle eyebrow="Track" title="Past reports" />
            {reports.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">No reports yet. Reports generated in this client’s campaigns are listed here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/projects/${r.projectId}/reports/${r.id}`} className="flex items-center gap-3 py-2.5 text-[13px] hover:text-violet">
                      <FileText className="size-4 shrink-0 text-violet" />
                      <span className="min-w-0 flex-1 truncate">{r.title}<span className="text-muted"> · {r.project}</span></span>
                      <span className="shrink-0 text-[12px] text-muted">{r.version ? `v${r.version} · ` : ""}{formatDate(r.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface className="p-6">
            <SectionTitle eyebrow="History" title="Client activity" />
            {activity.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">No activity recorded for this client yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]">
                    <span className="min-w-0"><b className="font-medium">{a.actor}</b> <span className="text-muted">{a.summary}</span>{a.project && <span className="text-faint"> · {a.project}</span>}</span>
                    <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)} className="shrink-0 text-[11px] text-faint">{timeAgo(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <Link href={`/workspace/clients/${client.id}/brand`} className="group relative block overflow-hidden rounded-[28px] bg-charcoal p-6 text-white">
            <ArtPlate theme={themeForCategory(client.industry)} seed={`${client.id}-brand`} rounded={false} className="absolute inset-0 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-br from-charcoal/90 to-charcoal/40" />
            <div className="relative">
              <p className="cc-eyebrow text-white/60">Brand memory</p>
              <p className="cc-display mt-3 text-4xl">
                {brand ? (brand.status === "approved" ? "Approved" : "Draft") : "Not started"}
              </p>
              <p className="mt-2 text-[13px] text-white/70">
                {brand?.status === "approved" && brand.approvedAt ? <><BadgeCheck className="mr-1 inline size-3.5" />Approved {formatDate(brand.approvedAt)}</> : brand ? `Updated ${timeAgo(brand.updatedAt)}` : "Guidelines, approved messaging, positioning, audiences and prior decisions."}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium group-hover:underline">Open brand memory <ArrowRight className="size-3.5" /></span>
            </div>
          </Link>

          <Surface className="p-6">
            <SectionTitle eyebrow="Details" title="About this client" />
            <div className="mt-4">
              {canEdit ? (
                <ClientDetailsForm clientId={client.id} initial={{ name: client.name, industry: client.industry ?? "", website: client.website ?? "", notes: client.notes ?? "" }} />
              ) : (
                <dl className="space-y-3 text-[13px]">
                  <div><dt className="text-muted">Industry</dt><dd>{client.industry ?? "—"}</dd></div>
                  <div><dt className="text-muted">Website</dt><dd className="break-all">{client.website ? <a className="underline underline-offset-2" href={client.website} target="_blank" rel="noopener noreferrer nofollow">{client.website}</a> : "—"}</dd></div>
                  <div><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{client.notes ?? "—"}</dd></div>
                </dl>
              )}
            </div>
            <p className="mt-4 text-[11px] text-faint">Added {formatDate(client.createdAt)}{client.createdBy ? ` by ${client.createdBy}` : ""} · updated {timeAgo(client.updatedAt)}</p>
          </Surface>
        </div>
      </div>
    </div>
  );
}
