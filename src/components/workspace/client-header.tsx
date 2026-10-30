import Link from "next/link";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { TabRow } from "@/components/settings/tab-row";

/** Breadcrumb + editorial title + contextual tabs for a single client. */
export function ClientHeader({ client, eyebrow, actions }: { client: { id: string; name: string }; eyebrow: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        <Link href="/workspace" className="hover:text-ink">Workspace</Link>
        <ChevronRight className="size-3" />
        <Link href="/workspace/clients" className="hover:text-ink">Clients</Link>
        <ChevronRight className="size-3" />
        <span className="font-medium text-ink">{client.name}</span>
      </nav>
      <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="cc-eyebrow text-muted">{eyebrow}</div>
          <h1 className="cc-display mt-3 break-words text-5xl md:text-[64px]">{client.name}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-6">
        <TabRow
          label={`${client.name} sections`}
          tabs={[
            { href: `/workspace/clients/${client.id}`, label: "Client workspace", exact: true },
            { href: `/workspace/clients/${client.id}/brand`, label: "Brand memory" },
            { href: `/workspace/clients/${client.id}/watch`, label: "Watch" },
          ]}
        />
      </div>
    </div>
  );
}
