"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createBoardAction, createBoardFromResearchAction } from "@/lib/boards/actions";

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

/** One click to a starter board laid out from the latest research run. */
export function BuildFromResearchButton({ projectId, size = "md" }: { projectId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  return (
    <Button size={size} variant="soft" disabled={pending} onClick={() => start(async () => {
      const r = await createBoardFromResearchAction(projectId);
      if (!r.ok) return toast({ title: "Board not built", description: r.error, tone: "error" });
      router.push(`/projects/${projectId}/boards/${r.data!.id}`);
    })}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Building…" : "Build from research"}
    </Button>
  );
}
