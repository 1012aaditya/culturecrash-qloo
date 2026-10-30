"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createBoardAction, createBoardFromResearchAction } from "@/lib/boards/actions";
import { cn } from "@/lib/utils";

export function NewBoardButton({ projectId, size = "md" }: { projectId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createBoardAction(projectId, name);
      if (!r.ok) return toast({ title: "Board not created", description: r.error, tone: "error" });
      setOpen(false);
      router.push(`/projects/${projectId}/boards/${r.data!.id}`);
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size}><Plus /> New board</Button>
      </DialogTrigger>
      <DialogContent title="New inspiration board" description="Name it after a direction, territory or meeting so the team knows what belongs on it.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Board name" htmlFor="board-name">
            <Input id="board-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Skin in Tune — visual world" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create board"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DirectionChoice = { id: string; name: string; slot: number; selected: boolean };

/**
 * A starter board laid out from the latest research run. With strategy directions, the board is built for
 * one of them: linked to it, named after it, and led by the references and evidence it names.
 */
export function BuildFromResearchButton({ projectId, directions = [], size = "md" }: { projectId: string; directions?: DirectionChoice[]; size?: "sm" | "md" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<string>(() => (directions.find((d) => d.selected) ?? directions[0])?.id ?? "");
  const build = (directionId: string | null) => start(async () => {
    const r = await createBoardFromResearchAction(projectId, directionId);
    if (!r.ok) return toast({ title: "Board not built", description: r.error, tone: "error" });
    setOpen(false);
    router.push(`/projects/${projectId}/boards/${r.data!.id}`);
  });
  const button = (
    <Button size={size} variant="soft" disabled={pending} onClick={directions.length ? () => setOpen(true) : () => build(null)}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Building…" : "Build from research"}
    </Button>
  );
  if (!directions.length) return button;
  return (
    <>
      {button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Build a board from research" description="Pick the direction this board should bring to life. Its idea, messages and cultural references lead the board; you add the images.">
          <form onSubmit={(e) => { e.preventDefault(); build(choice || null); }} className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="sr-only">Strategy direction</legend>
              {[...directions.map((d) => ({ id: d.id, label: `0${d.slot} · ${d.name}`, note: d.selected ? "Selected direction" : "" })), { id: "", label: "No direction", note: "Just the strongest research" }].map((o) => (
                <label key={o.id || "none"} className={cn("flex cursor-pointer items-center gap-3 rounded-cc border px-3 py-2.5 text-[14px]", choice === o.id ? "border-violet bg-lilac/40" : "border-line hover:border-lavender")}>
                  <input type="radio" name="direction" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="accent-violet" />
                  <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                  {o.note && <span className="shrink-0 text-[12px] text-muted">{o.note}</span>}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? <><Loader2 className="animate-spin" /> Building…</> : "Build board"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
