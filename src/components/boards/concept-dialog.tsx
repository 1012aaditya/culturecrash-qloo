"use client";

import * as React from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { conceptSetupAction, queueConceptsAction, type ConceptSetup } from "@/lib/concepts/actions";
import { cn } from "@/lib/utils";

export type ConceptRequest = { kind: "concept" | "variation"; sourcePath?: string; sourceTitle?: string };

/**
 * Prompt (prefilled from the brief, direction, Qloo tags and palette), count, and the GPU PC's status.
 * Mounted only while open, so each opening starts fresh.
 */
export function ConceptDialog({ boardId, request, onClose, onQueued }: {
  boardId: string; request: ConceptRequest; onClose: () => void; onQueued: (ids: string[], kind: ConceptRequest["kind"]) => void;
}) {
  const [setup, setSetup] = React.useState<ConceptSetup | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [count, setCount] = React.useState(2);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void conceptSetupAction(boardId).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      setSetup(r.data!);
      setPrompt((p) => p || r.data!.prompt);
    });
    return () => { live = false; };
  }, [boardId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await queueConceptsAction(boardId, { kind: request.kind, prompt, count, sourcePath: request.sourcePath });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onQueued(r.data!.ids, request.kind);
    onClose();
  };

  const variation = request.kind === "variation";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(620px,calc(100vw-24px))]"
        title={variation ? "Make variations" : "Generate concepts"}
        description={variation
          ? `New takes on “${request.sourceTitle || "this image"}”, keeping its composition.`
          : "Concept frames for this direction, made on the agency’s GPU PC. They land on the board labelled “AI concept”."}>
        <div className="space-y-4">
          <EngineLine setup={setup} />
          <label className="block">
            <span className="cc-eyebrow text-muted">Prompt</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} maxLength={2000} disabled={!setup && !error}
              className="mt-1.5 w-full resize-y rounded-cc border border-line bg-paper px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-violet"
              placeholder={setup ? "Describe the image" : "Building a prompt from the research…"} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="How many">
              <span className="mr-1 text-[12px] text-muted">How many</span>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)}
                  className={cn("size-8 rounded-full border text-[12px]", count === n ? "border-violet bg-lilac/60 text-violet-ink" : "border-line hover:bg-ink/5")}>{n}</button>
              ))}
            </div>
            <Button onClick={() => void submit()} disabled={busy || !setup || prompt.trim().length < 3}>
              {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} {variation ? "Make variations" : "Generate"}
            </Button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <p className="text-[11.5px] text-muted">AI concepts are for exploring a direction with the team and client, not final artwork. Each one gets a cultural-fit check when it arrives.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EngineLine({ setup }: { setup: ConceptSetup | null }) {
  if (!setup) return <p className="flex items-center gap-2 text-[12.5px] text-muted"><Loader2 className="size-3.5 animate-spin" /> Checking the GPU PC…</p>;
  const { online, ready, gpu } = setup.engine;
  return (
    <p className="flex items-center gap-2 text-[12.5px]">
      <span className={cn("size-2 rounded-full", ready ? "bg-emerald-500" : online ? "bg-amber-500" : "bg-ink/30")} aria-hidden="true" />
      {ready ? `GPU PC online${gpu ? ` · ${gpu}` : ""}. About a minute per image.`
        : online ? "GPU PC is on but ComfyUI isn’t ready yet. Images will wait in line."
          : "GPU PC is offline. Images wait in line for up to an hour."}
    </p>
  );
}
