"use client";

import { Check, Loader2, PencilLine, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CREATIVE_SECTIONS, type CreativeSectionKey } from "@/lib/ai/schemas";
import { reviseCreativeSectionAction, updateCreativeSectionAction } from "@/lib/strategy/actions";
import { cn } from "@/lib/utils";

export function CreativeBriefEditor({ briefId, content, revision: initialRevision, canEdit, llm }: {
  briefId: string; content: Record<string, string>; revision: number; canEdit: boolean; llm: boolean;
}) {
  const [sections, setSections] = React.useState(content);
  const [revision, setRevision] = React.useState(initialRevision);
  return (
    <ol className="divide-y divide-line">
      {CREATIVE_SECTIONS.map(([key, label], i) => (
        <Section key={key} index={i + 1} sectionKey={key} label={label} value={sections[key] ?? ""} briefId={briefId} revision={revision} canEdit={canEdit} llm={llm}
          onSaved={(v, r) => { setSections((s) => ({ ...s, [key]: v })); setRevision(r); }} />
      ))}
    </ol>
  );
}

function Section({ index, sectionKey, label, value, briefId, revision, canEdit, llm, onSaved }: {
  index: number; sectionKey: CreativeSectionKey; label: string; value: string; briefId: string; revision: number; canEdit: boolean; llm: boolean; onSaved: (v: string, r: number) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [instruction, setInstruction] = React.useState("");
  const [proposal, setProposal] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const save = (text: string) => start(async () => {
    const r = await updateCreativeSectionAction(briefId, sectionKey, text, revision);
    if (!r.ok) return toast({ tone: "error", title: r.error });
    onSaved(text, r.data!.revision);
    setEditing(false);
    setProposal(null);
    toast({ tone: "success", title: `${label} saved` });
    router.refresh();
  });

  return (
    <li className="grid gap-4 py-7 md:grid-cols-[200px_1fr]" data-presence-field={`cb-${sectionKey}`}>
      <div>
        <p className="font-mono text-[11px] text-faint">{String(index).padStart(2, "0")}</p>
        <h2 className="cc-display mt-1 text-2xl">{label}</h2>
      </div>
      <div>
        {editing ? (
          <div className="space-y-2">
            <Textarea aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-32" maxLength={8000} />
            <div className="flex gap-2"><Button size="sm" onClick={() => save(draft)} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />} Save section</Button><Button size="sm" variant="ghost" onClick={() => { setDraft(value); setEditing(false); }}>Cancel</Button></div>
          </div>
        ) : (
          <p className={cn("whitespace-pre-wrap text-[15px] leading-relaxed", !value && "text-faint")}>{value || "Empty"}</p>
        )}
        {proposal !== null && (
          <div className="mt-3 rounded-cc-sm border border-violet/30 bg-lilac/30 p-3" aria-live="polite">
            <p className="cc-eyebrow text-[9px] text-violet-ink">Proposed revision — not saved</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px]">{proposal}</p>
            <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => save(proposal)} disabled={pending}>Accept</Button><Button size="sm" variant="ghost" onClick={() => setProposal(null)}><X /> Discard</Button></div>
          </div>
        )}
        {canEdit && !editing && (
          <div className="cc-no-print mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(value); setEditing(true); }}><PencilLine /> Edit</Button>
            {llm && (
              <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await reviseCreativeSectionAction(briefId, sectionKey, instruction); if (!r.ok) toast({ tone: "error", title: r.error }); else { setProposal(r.data!.text); setInstruction(""); } }); }}>
                <label htmlFor={`rev-${sectionKey}`} className="sr-only">Revision instruction for {label}</label>
                <input id={`rev-${sectionKey}`} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Revise this section…" className="h-8 w-56 rounded-full border border-line px-3 text-[12px]" />
                <Button size="sm" variant="soft" type="submit" disabled={pending || instruction.trim().length < 4}><Wand2 /> Revise</Button>
              </form>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
