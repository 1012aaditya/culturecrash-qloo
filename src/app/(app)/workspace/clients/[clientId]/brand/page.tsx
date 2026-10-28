import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, CircleDashed, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandMemoryForm } from "@/components/workspace/brand-memory-form";
import { ClientHeader } from "@/components/workspace/client-header";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { getBrandMemory } from "@/lib/data/workspace-admin";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Brand memory" };

export default async function BrandMemoryPage({ params }: PageProps<"/workspace/clients/[clientId]/brand">) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const ctx = await getCtx();
  const data = await getBrandMemory(ctx, clientId);
  if (!data) notFound();
  const { client, brand, exists } = data;
  const canEdit = can(ctx.workspace.role, "client.edit");
  const canApprove = can(ctx.workspace.role, "brand.approve");

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <ClientHeader client={client} eyebrow={<>Brand memory{client.industry ? ` · ${client.industry}` : ""}</>} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <BrandMemoryForm
            clientId={client.id}
            status={brand.status}
            canEdit={canEdit}
            canApprove={canApprove}
            initial={{
              guidelines: brand.guidelines,
              approvedMessaging: brand.approvedMessaging,
              positioning: brand.positioning,
              audienceDefinitions: brand.audienceDefinitions,
              priorDecisions: brand.priorDecisions,
            }}
          />
        </div>

        <aside className="order-1 space-y-4 lg:order-2" aria-label="Approval status">
          <div className="rounded-cc-lg border border-line bg-paper p-5">
            <p className="cc-eyebrow text-muted">Status</p>
            <div className="mt-3 flex items-center gap-2">
              {brand.status === "approved" ? (
                <Badge tone="success" className="text-[12px]"><BadgeCheck /> Approved</Badge>
              ) : (
                <Badge tone="outline" className="text-[12px]"><CircleDashed /> {exists ? "Draft" : "Not started"}</Badge>
              )}
            </div>
            <dl className="mt-4 space-y-2.5 text-[13px]">
              {brand.status === "approved" && (
                <div>
                  <dt className="text-muted">Approved by</dt>
                  <dd>{brand.approvedBy ?? "A former member"}{brand.approvedAt && <span className="block text-[12px] text-muted">{formatDateTime(brand.approvedAt)}</span>}</dd>
                </div>
              )}
              {brand.updatedAt && (
                <div>
                  <dt className="text-muted">Last edited</dt>
                  <dd>{brand.updatedBy ?? "A former member"}<span className="block text-[12px] text-muted">{formatDateTime(brand.updatedAt)}</span></dd>
                </div>
              )}
            </dl>
          </div>
          <div className="rounded-cc-lg border border-line bg-paper/60 p-5 text-[12px] leading-relaxed text-muted">
            <p className="flex items-center gap-1.5 font-medium text-ink"><ShieldCheck className="size-3.5 text-violet" /> How approval works</p>
            <p className="mt-2">Members can draft and edit. Admins and owners approve. Editing approved memory returns it to draft, so an approval always refers to the exact text that was reviewed.</p>
            <p className="mt-2">Brand memory stays inside this client and workspace. It is never shared with other clients.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
