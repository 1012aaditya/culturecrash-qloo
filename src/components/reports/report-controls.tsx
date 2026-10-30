"use client";

import { When } from "@/components/ui/time";
import { Copy, FileText, Link2, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createReportAction, createReportVersionAction, createShareLinkAction, revokeShareLinkAction } from "@/lib/reports/actions";
import { PITCH_PACK_SECTIONS, REPORT_SECTIONS } from "@/lib/reports/types";
import { formatDateTime } from "@/lib/utils";

function SectionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid gap-1.5 sm:grid-cols-2">
      <legend className="mb-2 text-[13px] font-medium">Sections</legend>
      {REPORT_SECTIONS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} /> {label}
        </label>
      ))}
    </fieldset>
  );
}

export function NewReport({ projectId, defaultTitle, defaultOpen }: { projectId: string; defaultTitle: string; defaultOpen: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(defaultOpen);
  const [title, setTitle] = React.useState(defaultTitle);
  const [sections, setSections] = React.useState<string[]>(REPORT_SECTIONS.map(([k]) => k));
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Generate report</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Generate a report" description="The report is a frozen snapshot of the campaign as it is now. Later changes create new versions instead of rewriting it.">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createReportAction(projectId, title, sections); if (!r.ok) return toast({ tone: "error", title: r.error }); setOpen(false); router.push(`/projects/${projectId}/reports/${r.data!.id}`); }); }}>
            <Field label="Title" htmlFor="rep-title"><Input id="rep-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
            <SectionPicker value={sections} onChange={setSections} />
            <Button type="submit" disabled={pending || !sections.length}>{pending ? <Loader2 className="animate-spin" /> : <FileText />} Generate</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One click to a pitch-ready report: recommendation, taste map and the answered objections. */
export function PitchPackButton({ projectId, projectName, hasObjections }: { projectId: string; projectName: string; hasObjections: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  return (
    <Button variant="outline" disabled={pending} title={hasObjections ? undefined : "Run the Devil’s Advocate in the strategy studio first to include answered objections."}
      onClick={() => start(async () => {
        const r = await createReportAction(projectId, `Pitch pack — ${projectName}`.slice(0, 200), PITCH_PACK_SECTIONS);
        if (!r.ok) return toast({ tone: "error", title: r.error });
        toast({ tone: "success", title: "Pitch pack created", description: hasObjections ? "Share it as a link or download the PDF." : "It has no answered objections yet: run the Devil’s Advocate on the strategy, then add a new version." });
        router.push(`/projects/${projectId}/reports/${r.data!.id}`);
      })}>
      {pending ? <Loader2 className="animate-spin" /> : <Share2 />} Create pitch pack
    </Button>
  );
}

export function NewVersion({ reportId, current, canCreate }: { reportId: string; current: string[]; canCreate: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [sections, setSections] = React.useState(current);
  const [pending, start] = React.useTransition();
  if (!canCreate) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Customise / new version</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Create a new version" description="Re-snapshots the current research, strategy and experiments with the sections you choose. Existing versions are never modified.">
          <SectionPicker value={sections} onChange={setSections} />
          <Button className="mt-4" disabled={pending || !sections.length} onClick={() => start(async () => { const r = await createReportVersionAction(reportId, sections); if (!r.ok) return toast({ tone: "error", title: r.error }); setOpen(false); toast({ tone: "success", title: `Version ${r.data!.version} created` }); router.push(`?v=${r.data!.version}`); router.refresh(); })}>
            {pending ? "Creating…" : "Create version"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type ShareLink = { id: string; label: string | null; expiresAt: string | null; revokedAt: string | null; accessCount: number; lastAccessedAt: string | null; createdAt: string; createdBy: string; version: number };

export function ShareDialog({ reportVersionId, version, links, canShare, defaultOpen }: { reportVersionId: string; version: number; links: ShareLink[]; canShare: boolean; defaultOpen: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(defaultOpen);
  const [label, setLabel] = React.useState("");
  const [days, setDays] = React.useState("30");
  const [created, setCreated] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const active = links.filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date()));
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Share2 /> Share{active.length ? ` (${active.length})` : ""}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreated(null); }}>
        <DialogContent title="Share a read-only link" description={`Anyone with the link can view version ${version} of this report — nothing else in your workspace. Links can expire and can be revoked at any time.`} className="w-[min(640px,calc(100vw-24px))]">
          {canShare && (
            <form className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createShareLinkAction(reportVersionId, label, days === "never" ? null : Number(days)); if (!r.ok) return toast({ tone: "error", title: r.error }); setCreated(r.data!.url); setLabel(""); router.refresh(); }); }}>
              <Field label="Label" htmlFor="sh-label" optional><Input id="sh-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Client review" maxLength={120} /></Field>
              <Field label="Expires" htmlFor="sh-exp"><Select id="sh-exp" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">In 7 days</option><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="never">Never</option></Select></Field>
              <Button type="submit" disabled={pending}><Link2 /> Create link</Button>
            </form>
          )}
          {created && (
            <div className="mt-4 rounded-cc-sm border border-violet/30 bg-lilac/30 p-3" role="status">
              <p className="text-[12px] font-medium">Copy this link now — it will not be shown again.</p>
              <div className="mt-2 flex gap-2"><Input readOnly value={created} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} /><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(created); toast({ tone: "success", title: "Link copied" }); } catch { toast({ tone: "error", title: "Copy failed — select the text instead" }); } }}><Copy /> Copy</Button></div>
            </div>
          )}
          <div className="mt-5">
            <p className="text-[13px] font-medium">Who can access</p>
            {links.length === 0 ? <p className="mt-1 text-[13px] text-muted">Only members of your workspace. No links have been created.</p> : (
              <ul className="mt-2 divide-y divide-line text-[12px]">
                {links.map((l) => {
                  const expired = l.expiresAt && new Date(l.expiresAt) <= new Date();
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1"><b className="font-medium">{l.label ?? "Untitled link"}</b> · v{l.version} · by {l.createdBy}<br /><span className="text-muted">{l.expiresAt ? `expires $<When value={l.expiresAt} />` : "no expiry"} · viewed {l.accessCount}×{l.lastAccessedAt ? `, last $<When value={l.lastAccessedAt} />` : ""}</span></span>
                      {l.revokedAt ? <Badge tone="neutral">revoked</Badge> : expired ? <Badge tone="neutral">expired</Badge> : (
                        <Button size="sm" variant="ghost" onClick={() => start(async () => { const r = await revokeShareLinkAction(l.id); if (!r.ok) toast({ tone: "error", title: r.error }); else { toast({ tone: "success", title: "Link revoked" }); router.refresh(); } })}><Trash2 /> Revoke</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
