import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientHeader } from "@/components/workspace/client-header";
import { WatchHealth, WatchRunHistory, WatchTimeline } from "@/components/watch/watch-timeline";
import { WatchConfigForm } from "@/components/watch/watch-config-form";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";
import { getWatchView } from "@/lib/watch/data";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({ params }: PageProps<"/workspace/clients/[clientId]/watch">) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const ctx = await getCtx();
  const view = await getWatchView(ctx, clientId);
  if (!view) notFound();
  const canEdit = can(ctx.workspace.role, "client.edit");
  const company = view.targets.find((t) => t.role === "company")?.name ?? view.client.name;

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <ClientHeader client={view.client} eyebrow="Watch · news about this client and its competitors" />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="order-2 min-w-0 lg:order-1" aria-labelledby="watch-timeline">
          <WatchTimeline view={view} />
        </section>
        <aside className="order-1 space-y-4 lg:order-2" aria-label="Watch settings and health">
          <WatchHealth view={view} canEdit={canEdit} />
          <WatchRunHistory runs={view.runs} />
          <WatchConfigForm
            clientId={view.client.id}
            canEdit={canEdit}
            exists={Boolean(view.watch)}
            initial={{
              company,
              competitors: view.targets.filter((t) => t.role === "competitor").map((t) => t.name),
              keywords: view.watch?.keywords ?? [],
              market: view.watch?.market ?? "",
              frequency: view.watch?.frequency ?? "daily",
            }}
          />
        </aside>
      </div>
    </div>
  );
}
