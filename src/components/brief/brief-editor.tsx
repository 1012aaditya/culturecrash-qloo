"use client";

import { When } from "@/components/ui/time";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CloudOff, FileText, Image as ImageIcon, Loader2, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  deleteBriefDocumentAction, finishBriefUploadAction, proposeBriefFieldsAction, saveBriefAction, startBriefUploadAction, uploadBriefDocumentAction, type BriefFields, type UploadResult,
} from "@/lib/data/brief-actions";
import type { BriefExtraction } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Doc = { id: string; fileName: string; size: number; status: string; stored: boolean; text: string | null; createdAt: string };
type Issue = { field: string; severity: "important" | "helpful"; why: string };
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

const LABELS: Record<string, string> = {
  brand: "Brand", product: "Product or service", category: "Product category", market: "Market & geography", audience: "Target audience",
  objective: "Campaign objective", existingPositioning: "Existing positioning", competitors: "Competitors", interests: "Audience interests", timeframe: "Campaign timeframe", budgetRange: "Budget range",
};

function TagInput({ id, value, onChange, placeholder, disabled }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; disabled?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const parts = draft.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, 20));
    setDraft("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-cc-sm border border-line bg-paper px-2 py-1.5 focus-within:border-violet focus-within:ring-4 focus-within:ring-violet/12">
      {value.map((v) => (
        <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-lilac/70 px-2.5 py-0.5 text-[12px] text-violet-ink">
          <span className="truncate">{v}</span>
          {!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="size-3" /></button>}
        </span>
      ))}
      <input
        id={id}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[140px] flex-1 bg-transparent px-1 text-[14px] outline-none placeholder:text-faint"
      />
    </div>
  );
}

export function BriefEditor({
  projectId, initial, revision: initialRevision, updatedAt, documents, issues: initialIssues, canEdit, llm,
}: {
  projectId: string; initial: BriefFields; revision: number; updatedAt: string; documents: Doc[]; issues: Issue[]; canEdit: boolean; llm: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = React.useState<BriefFields>(initial);
  const [revision, setRevision] = React.useState(initialRevision);
  const [state, setState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState(updatedAt);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [paste, setPaste] = React.useState("");
  const [proposal, setProposal] = React.useState<{ data: BriefExtraction; generator: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef(fields);
  const rev = React.useRef(revision);
  React.useEffect(() => {
    latest.current = fields;
    rev.current = revision;
  }, [fields, revision]);

  const save = React.useCallback(async () => {
    setState("saving");
    const res = await saveBriefAction(projectId, rev.current, latest.current);
    if (res.ok) {
      setRevision(res.revision);
      setSavedAt(res.savedAt);
      setFieldErrors({});
      setError(null);
      setState((s) => (s === "saving" ? "saved" : s));
      router.refresh();
    } else {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      setState(res.conflict ? "conflict" : "error");
    }
  }, [projectId, router]);

  // Debounced autosave.
  React.useEffect(() => {
    if (state !== "dirty") return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [fields, state, save]);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || state === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [state]);

  const set = <K extends keyof BriefFields>(k: K, v: BriefFields[K]) => {
    setFields((f) => ({ ...f, [k]: v }));
    if (state !== "conflict") setState("dirty");
  };
  const str = (k: keyof BriefFields) => (fields[k] as string | null) ?? "";

  async function upload(file: File) {
    setBusy("upload");
    let res: UploadResult;
    try {
      // With Supabase Storage the file goes straight from the browser to Storage through a one-time
      // signed URL (no 4.5 MB function limit); the server then reads it back and processes it.
      const ticket = await startBriefUploadAction(projectId, file.name, file.size, file.type);
      if (!ticket.ok) res = ticket;
      else if (ticket.mode === "direct") {
        const { createBrowserClient } = await import("@supabase/ssr");
        const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { error } = await client.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || "application/octet-stream" });
        res = error ? { ok: false, error: "The file couldn't be sent to storage. Check your connection and try again." } : await finishBriefUploadAction(projectId, ticket.path, file.name, file.type);
      } else {
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("file", file);
        res = await uploadBriefDocumentAction(fd);
      }
    } catch {
      res = { ok: false, error: "The upload failed or timed out. Try again." };
    } finally {
      setBusy(null);
    }
    if (!res.ok) return toast({ tone: "error", title: "Upload failed", description: res.error });
    toast({ tone: "success", title: res.extracted ? "Document uploaded and text extracted" : "Document uploaded", description: res.extracted ? "Use “Propose fields” to review suggested brief fields." : "Text could not be extracted from this file." });
    router.refresh();
  }

  async function propose(text: string) {
    setBusy("propose");
    const res = await proposeBriefFieldsAction(projectId, text);
    setBusy(null);
    if (!res.ok) return toast({ tone: "error", title: res.error });
    setProposal({ data: res.proposal, generator: res.generator });
  }

  function accept(key: keyof BriefExtraction) {
    if (!proposal) return;
    const v = proposal.data[key];
    if (key === "competitors") set("competitors", [...new Set([...(fields.competitors ?? []), ...(v as string[])])]);
    else if (key === "interests") set("interests", [...new Set([...(fields.interests ?? []), ...(v as string[])])]);
    else set(key as keyof BriefFields, v as never);
  }

  const statusChip = {
    idle: <span className="text-muted">Saved <When value={savedAt} /></span>,
    dirty: <span className="text-muted">Unsaved changes…</span>,
    saving: <span className="inline-flex items-center gap-1.5 text-muted"><Loader2 className="size-3.5 animate-spin" /> Saving</span>,
    saved: <span className="inline-flex items-center gap-1.5 text-success"><CheckCircle2 className="size-3.5" /> Saved</span>,
    error: <span className="inline-flex items-center gap-1.5 text-danger"><CloudOff className="size-3.5" /> Save failed</span>,
    conflict: <span className="inline-flex items-center gap-1.5 text-warning"><AlertCircle className="size-3.5" /> Edit conflict</span>,
  }[state];

  const issues = initialIssues;
  const disabled = !canEdit;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="cc-glass sticky top-[76px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-full px-4 py-2 text-[12px]">
          <div role="status" aria-live="polite">{statusChip}</div>
          <div className="flex items-center gap-2">
            {(state === "error") && <Button size="sm" variant="outline" onClick={save}>Retry save</Button>}
            {state === "conflict" && <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload latest</Button>}
            <Button size="sm" variant="ghost" onClick={save} disabled={disabled || state === "saving"}>Save now</Button>
            <Button size="sm" asChild><Link href={`/projects/${projectId}/research`}><Sparkles /> Go to research</Link></Button>
          </div>
        </div>
        {error && <p role="alert" className="rounded-cc-sm bg-danger/8 p-3 text-[13px] text-danger">{error}</p>}
        {!canEdit && <p className="rounded-cc-sm bg-ink/5 p-3 text-[13px] text-muted">You have view-only access to this brief.</p>}

        <fieldset disabled={disabled} className="space-y-6">
          <section className="rounded-cc-lg border border-line bg-paper p-6">
            <h2 className="cc-eyebrow mb-5 text-muted">The brand</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Brand" htmlFor="brand" error={fieldErrors.brand}><Input id="brand" value={str("brand")} onChange={(e) => set("brand", e.target.value)} maxLength={160} /></Field>
              <Field label="Product or service" htmlFor="product"><Input id="product" value={str("product")} onChange={(e) => set("product", e.target.value)} maxLength={400} /></Field>
              <Field label="Product category" htmlFor="category"><Input id="category" value={str("category")} onChange={(e) => set("category", e.target.value)} maxLength={120} /></Field>
              <Field label="Market & geography" htmlFor="market" hint="City, country or region. Sent to Qloo as a location signal."><Input id="market" value={str("market")} onChange={(e) => set("market", e.target.value)} maxLength={160} /></Field>
            </div>
            <div className="mt-5 grid gap-5">
              <Field label="Existing positioning" htmlFor="existingPositioning"><Textarea id="existingPositioning" value={str("existingPositioning")} onChange={(e) => set("existingPositioning", e.target.value)} maxLength={2000} /></Field>
              <Field label="Competitors" htmlFor="competitors" hint="Press Enter or comma to add. Up to 3 are used as research signals."><TagInput id="competitors" value={fields.competitors ?? []} onChange={(v) => set("competitors", v)} placeholder="Add a competitor" disabled={disabled} /></Field>
              <Field label="Audience interests" htmlFor="interests" hint="Passions and lifestyles, e.g. skincare, K-pop, street football. Up to 4 are matched to Qloo taste tags and used as research signals."><TagInput id="interests" value={fields.interests ?? []} onChange={(v) => set("interests", v)} placeholder="Add an interest" disabled={disabled} /></Field>
            </div>
          </section>

          <section className="rounded-cc-lg border border-line bg-paper p-6">
            <h2 className="cc-eyebrow mb-5 text-muted">The people & the goal</h2>
            <div className="grid gap-5">
              <Field label="Target audience" htmlFor="audience" hint="Who you want to reach, in your own words. Mentioning age cohorts enables demographic filtering in Qloo.">
                <Textarea id="audience" value={str("audience")} onChange={(e) => set("audience", e.target.value)} maxLength={2000} />
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted">Quick age cohort filter:</span>
                  {[
                    { label: "Gen Z (18–24)", tag: "18-24" },
                    { label: "Young Millennials (25–34)", tag: "25-34" },
                    { label: "Older Millennials (35–44)", tag: "35-44" },
                    { label: "Gen X (45–54)", tag: "45-54" },
                  ].map((cohort) => {
                    const active = str("audience").toLowerCase().includes(cohort.tag);
                    return (
                      <button
                        key={cohort.tag}
                        type="button"
                        onClick={() => {
                          const cur = str("audience");
                          if (active) return;
                          const updated = cur ? `${cur.trim()} [Age cohort: ${cohort.label}]` : cohort.label;
                          set("audience", updated);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 transition-colors",
                          active ? "border-violet bg-lilac font-medium text-violet-ink" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
                        )}
                      >
                        {cohort.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Campaign objective" htmlFor="objective"><Textarea id="objective" value={str("objective")} onChange={(e) => set("objective", e.target.value)} maxLength={2000} /></Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Budget range" htmlFor="budgetRange" optional><Input id="budgetRange" value={str("budgetRange")} onChange={(e) => set("budgetRange", e.target.value)} maxLength={120} /></Field>
                <Field label="Timeframe" htmlFor="timeframe" optional><Input id="timeframe" value={str("timeframe")} onChange={(e) => set("timeframe", e.target.value)} maxLength={160} /></Field>
              </div>
            </div>
          </section>

          <section className="rounded-cc-lg border border-line bg-paper p-6">
            <h2 className="cc-eyebrow mb-5 text-muted">Context</h2>
            <div className="grid gap-5">
              <Field label="Brand guidelines" htmlFor="brandGuidelines" optional><Textarea id="brandGuidelines" value={str("brandGuidelines")} onChange={(e) => set("brandGuidelines", e.target.value)} maxLength={6000} /></Field>
              <Field label="Relevant public URLs" htmlFor="publicUrls" optional error={fieldErrors.publicUrls} hint="Stored as references. Pages are not fetched automatically (no web research provider is configured)."><TagInput id="publicUrls" value={fields.publicUrls ?? []} onChange={(v) => set("publicUrls", v)} placeholder="https://…" disabled={disabled} /></Field>
              <Field label="Additional context" htmlFor="additionalContext" optional><Textarea id="additionalContext" value={str("additionalContext")} onChange={(e) => set("additionalContext", e.target.value)} maxLength={8000} className="min-h-32" /></Field>
            </div>
          </section>
        </fieldset>
      </div>

      <aside className="space-y-5" aria-label="Brief assistance">
        <section className="rounded-cc-lg border border-line bg-paper p-5">
          <h2 className="text-[14px] font-semibold">Brief check</h2>
          {issues.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-[13px] text-success"><CheckCircle2 className="size-4" /> Core research inputs are present.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {issues.map((i) => (
                <li key={i.field} className="text-[13px]">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn("size-1.5 rounded-full", i.severity === "important" ? "bg-coral" : "bg-lavender")} />
                    {LABELS[i.field] ?? i.field} <Badge tone={i.severity === "important" ? "peach" : "outline"}>{i.severity}</Badge>
                  </span>
                  <span className="mt-0.5 block pl-3.5 text-[12px] leading-snug text-muted">{i.why}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-faint">Updates after each save. Optional fields never block research.</p>
        </section>

        <section className="rounded-cc-lg border border-line bg-paper p-5">
          <h2 className="text-[14px] font-semibold">Documents & Moodboards</h2>
          <p className="mt-1 text-[12px] text-muted">PDF, DOCX, TXT, MD, or visual moodboards & creative assets (PNG, JPG, WEBP). Visual aesthetics, cultural tags, and audience taste codes are extracted via Claude Vision.</p>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/*" className="sr-only" id="brief-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <Button variant="outline" size="sm" className="mt-3" disabled={disabled || busy === "upload"} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Upload document or moodboard
          </Button>
          <ul className="mt-4 space-y-2">
            {documents.map((d) => {
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(d.fileName);
              return (
                <li key={d.id} className="rounded-cc-sm border border-line p-2.5 text-[12px]">
                  <div className="flex items-center gap-2">
                    {isImg ? <ImageIcon className="size-4 text-coral" /> : <FileText className="size-4 text-violet" />}
                    <span className="min-w-0 flex-1 truncate font-medium">{d.fileName}</span>
                    {canEdit && <button onClick={async () => {
                      const r = await deleteBriefDocumentAction(projectId, d.id);
                      if (!r.ok) toast({ tone: "error", title: "Not deleted", description: r.error });
                      router.refresh();
                    }} aria-label={`Delete ${d.fileName}`} className="text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>}
                  </div>
                  <p className="mt-1 text-muted">
                    {(d.size / 1024).toFixed(0)} KB · {isImg ? (d.status === "extracted" ? "visual aesthetics extracted (Claude Vision)" : "vision processing failed") : (d.status === "extracted" ? "text extracted" : d.status === "failed" ? "extraction failed" : "unsupported")}
                    {d.stored ? " · original stored" : " · original not stored"}
                  </p>
                  {d.text && canEdit && <Button size="sm" variant="soft" className="mt-2" disabled={busy === "propose"} onClick={() => propose(d.text!)}><Wand2 /> Propose fields</Button>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-cc-lg border border-line bg-paper p-5">
          <h2 className="text-[14px] font-semibold">Paste a brief</h2>
          <Textarea aria-label="Pasted brief text" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a client brief or email…" className="mt-3 min-h-28 text-[13px]" disabled={disabled} />
          <Button size="sm" variant="soft" className="mt-2" disabled={disabled || busy === "propose" || paste.trim().length < 20} onClick={() => propose(paste)}>
            {busy === "propose" ? <Loader2 className="animate-spin" /> : <Wand2 />} Propose fields
          </Button>
          {!llm && <p className="mt-2 text-[11px] text-faint">No LLM configured: proposals use label matching (e.g. “Audience: …”).</p>}
        </section>

        {proposal && (
          <section className="rounded-cc-lg border border-violet/30 bg-lilac/30 p-5" aria-live="polite">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Proposed fields</h2>
              <button onClick={() => setProposal(null)} aria-label="Dismiss proposal"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-[11px] text-muted">{proposal.generator === "template-engine" ? "Label matching (no LLM)" : `Extracted by ${proposal.generator.replace("llm:", "")}`}. Review each value before accepting.</p>
            <ul className="mt-3 space-y-2">
              {(Object.keys(proposal.data) as (keyof BriefExtraction)[]).filter((k) => (Array.isArray(proposal.data[k]) ? (proposal.data[k] as string[]).length : proposal.data[k])).map((k) => (
                <li key={k} className="rounded-cc-sm bg-paper p-2.5 text-[12px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{LABELS[k] ?? k}</span><Button size="sm" variant="outline" className="h-7" onClick={() => accept(k)}>Accept</Button></div>
                  <p className="mt-1 line-clamp-3 text-muted">{Array.isArray(proposal.data[k]) ? (proposal.data[k] as string[]).join(", ") : String(proposal.data[k])}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
