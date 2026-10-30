"use client";

import { Plus, Rss, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Ago } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { saveWatchSourcesAction } from "@/lib/watch/actions";
import type { WatchSource } from "@/lib/watch/data";

const STATUS: Record<WatchSource["status"], { label: string; tone: "success" | "warning" | "danger" | "outline" }> = {
  pending: { label: "Checked with the next run", tone: "outline" },
  ok: { label: "Watching", tone: "success" },
  blocked: { label: "Site blocks us", tone: "warning" },
  robots: { label: "Not allowed by the site", tone: "warning" },
  needs_browser: { label: "Needs a browser", tone: "warning" },
  error: { label: "Can't be read", tone: "danger" },
};

type Row = { key: string; target: string; url: string; source?: WatchSource };

/**
 * The company websites and newsroom feeds a watch follows: up to three pages and two feeds per company.
 * Feeds a page links to are added automatically and appear here.
 */
export function WatchSourcesForm({ clientId, companies, sources, canEdit }: { clientId: string; companies: string[]; sources: WatchSource[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  // The page renders this with a key built from the saved sources, so a refresh after saving starts it afresh.
  const [rows, setRows] = React.useState<Row[]>(() => sources.map((s) => ({ key: s.id, target: s.target, url: s.url, source: s })));
  const [msg, setMsg] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();

  const update = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch, source: patch.url !== undefined && patch.url !== x.url ? undefined : x.source } : x)));
  const save = () => start(async () => {
    const r = await saveWatchSourcesAction(clientId, rows.filter((x) => x.url.trim()).map((x) => ({ target: x.target, url: x.url.trim() })));
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.message });
    toast({ tone: "success", title: "Websites saved", description: r.message });
    router.refresh();
  });

  return (
    <form className="rounded-cc-lg border border-line bg-paper p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="cc-eyebrow text-muted">Websites</p>
      <p className="mt-2 text-[12px] leading-snug text-muted">Newsrooms, product or pricing pages. We report meaningful changes and ignore dates and rotating banners. Sites that block automated visits are left alone.</p>
      {rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="space-y-1.5">
              <div className="flex gap-2">
                <Select aria-label="Company" value={r.target} disabled={!canEdit || pending} onChange={(e) => update(r.key, { target: e.target.value })} className="w-[38%] shrink-0 text-[13px]">
                  {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input aria-label="Web address" value={r.url} disabled={!canEdit || pending} onChange={(e) => update(r.key, { url: e.target.value })} placeholder="https://" className="min-w-0 text-[13px]" />
                {canEdit && (
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove this address" disabled={pending} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              {r.source && (
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  <Badge tone={STATUS[r.source.status].tone}>{r.source.kind === "feed" && <Rss />}{STATUS[r.source.status].label}</Badge>
                  {r.source.discovered && <span>found on a watched page</span>}
                  {r.source.lastChangedAt && <span>· changed <Ago value={r.source.lastChangedAt} /></span>}
                  {r.source.detail && r.source.status !== "ok" && <span className="basis-full">{r.source.detail}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending || rows.length >= 15} onClick={() => setRows((x) => [...x, { key: `new-${Date.now()}`, target: companies[0], url: "" }])}>
            <Plus /> Add a website
          </Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save websites"}</Button>
          <FormStatus error={msg.error} success={msg.success} />
        </div>
      ) : !rows.length && <p className="mt-3 text-[12px] text-muted">No websites are watched.</p>}
    </form>
  );
}
