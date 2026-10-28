import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { ArtPlate, themeForCategory } from "@/components/art/plate";
import { EmptyState, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { DeleteClientButton, NewClientButton } from "@/components/workspace/client-forms";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { getCtx } from "@/lib/data/workspace";
import { listClients } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };

function host(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Asymmetric rhythm: two rows beside the lead card (4+3, 7), then alternating 5/7 pairs. */
function spanFor(i: number) {
  if (i < 3) return ["lg:col-span-4", "lg:col-span-3", "lg:col-span-7"][i];
  return ["lg:col-span-5", "lg:col-span-7", "lg:col-span-7", "lg:col-span-5"][(i - 3) % 4];
}

export default async function ClientsPage() {
  const ctx = await getCtx();
  const clients = await listClients(ctx);
  const canEdit = can(ctx.workspace.role, "client.edit");
  const canDelete = can(ctx.workspace.role, "data.delete");
  const [lead, ...rest] = clients;

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <PageHeader
        eyebrow={<>Client portfolio · {ctx.workspace.name}</>}
        title="Clients"
        description="Each client keeps its campaigns, past reports and approved brand memory together — and separate from every other client."
        actions={canEdit && <NewClientButton />}
      />
      <div className="mt-8"><WorkspaceTabs clientCount={clients.length} /></div>

      {clients.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="No clients yet"
          body={canEdit ? "Add your first client. You can also create one while starting a new campaign." : "Members, admins and owners can add clients. Your role is read-only."}
          action={canEdit ? <NewClientButton size="sm" /> : undefined}
        />
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-12">
          <article className="relative flex min-h-[360px] flex-col overflow-hidden rounded-[32px] bg-charcoal text-white lg:col-span-5 lg:row-span-2">
            <ArtPlate theme={themeForCategory(lead.industry)} seed={lead.id} rounded={false} className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/50 to-transparent" />
            <div className="relative mt-auto p-7">
              <div className="flex flex-wrap gap-2">
                <Badge tone="glass">Most recently updated</Badge>
                {lead.brandStatus === "approved" ? <Badge tone="glass">Brand memory approved</Badge> : lead.brandStatus === "draft" ? <Badge tone="glass">Brand memory draft</Badge> : null}
              </div>
              <h2 className="cc-display mt-4 text-5xl md:text-6xl">
                <Link href={`/workspace/clients/${lead.id}`} className="hover:underline decoration-1 underline-offset-4">{lead.name}</Link>
              </h2>
              <p className="mt-2 text-[13px] text-white/70">{[lead.industry, host(lead.website)].filter(Boolean).join(" · ") || "No industry recorded"}</p>
              <p className="mt-4 text-[13px] text-white/80">{lead.projectCount} {lead.projectCount === 1 ? "campaign" : "campaigns"} · {lead.activeProjectCount} open · updated {timeAgo(lead.updatedAt)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/workspace/clients/${lead.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-medium text-ink hover:bg-ivory">Open client <ArrowUpRight className="size-3.5" /></Link>
                <Link href={`/workspace/clients/${lead.id}/brand`} className="inline-flex h-9 items-center rounded-full px-4 text-[13px] text-white/80 hover:bg-white/10">Brand memory</Link>
              </div>
            </div>
          </article>

          {rest.map((c, i) => (
            <article key={c.id} className={cn("flex flex-col rounded-cc-lg border border-line bg-paper p-5 shadow-card", spanFor(i))}>
              <div className="flex items-start gap-3">
                <ArtPlate theme={themeForCategory(c.industry)} seed={c.id} className="size-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[16px] font-semibold tracking-tight">
                    <Link href={`/workspace/clients/${c.id}`} className="hover:text-violet">{c.name}</Link>
                  </h2>
                  <p className="truncate text-[12px] text-muted">{[c.industry, host(c.website)].filter(Boolean).join(" · ") || "No industry recorded"}</p>
                </div>
              </div>
              {c.notes && <p className="mt-3 line-clamp-2 text-[13px] text-muted">{c.notes}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-[12px] text-muted">
                <span>{c.projectCount} {c.projectCount === 1 ? "campaign" : "campaigns"}</span>
                <span aria-hidden>·</span>
                <span>updated {timeAgo(c.updatedAt)}</span>
                {c.brandStatus === "approved" ? <Badge tone="success">Brand approved</Badge> : c.brandStatus === "draft" ? <Badge tone="outline">Brand draft</Badge> : <Badge tone="outline">No brand memory</Badge>}
                <span className="ml-auto flex items-center gap-1">
                  {canDelete && <DeleteClientButton clientId={c.id} name={c.name} projectCount={c.projectCount} />}
                  <Link href={`/workspace/clients/${c.id}`} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] text-ink hover:bg-ink/5">Open <ArrowUpRight className="size-3.5" /></Link>
                </span>
              </div>
            </article>
          ))}
          {rest.length === 0 && (
            <div className="rounded-cc-lg border border-dashed border-line-strong p-6 text-[13px] text-muted lg:col-span-7">
              One client so far. Clients you add appear here with their campaign counts and brand memory status.
            </div>
          )}
        </div>
      )}
      {canDelete && clients.length > 0 && <p className="mt-6 text-[12px] text-faint">Deleting a client removes its brand memory; its campaigns are kept and unlinked. To delete the featured client, open it.</p>}
    </div>
  );
}
