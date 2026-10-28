"use client";

import { Archive, ArchiveRestore, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { deleteProjectAction, renameProjectAction, setProjectStatusAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function ProjectActions({ project, canEdit, canDelete, dark }: { project: { id: string; name: string; status: string }; canEdit: boolean; canDelete: boolean; dark?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = React.useState<"rename" | "delete" | null>(null);
  const [value, setValue] = React.useState(project.name);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!canEdit && !canDelete) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Failed");
        toast({ tone: "error", title: r.error ?? "Action failed" });
        return;
      }
      setDialog(null);
      setError(null);
      toast({ tone: "success", title: done });
      router.refresh();
    });

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn("relative z-10 inline-flex size-8 items-center justify-center rounded-full", dark ? "bg-black/25 text-white backdrop-blur hover:bg-black/40" : "hover:bg-ink/5")}
            aria-label={`Actions for ${project.name}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent>
          {canEdit && <MenuItem onSelect={() => { setValue(project.name); setDialog("rename"); }}><PencilLine /> Rename</MenuItem>}
          {canEdit && (project.status === "archived" ? (
            <MenuItem onSelect={() => run(() => setProjectStatusAction(project.id, "active"), "Campaign restored")}><ArchiveRestore /> Restore</MenuItem>
          ) : (
            <MenuItem onSelect={() => run(() => setProjectStatusAction(project.id, "archived"), "Campaign archived")}><Archive /> Archive</MenuItem>
          ))}
          {canDelete && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => { setValue(""); setDialog("delete"); }} className="text-danger [&_svg]:!text-danger"><Trash2 /> Delete…</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Rename campaign">
          <form onSubmit={(e) => { e.preventDefault(); run(() => renameProjectAction(project.id, value), "Campaign renamed"); }} className="space-y-4">
            <Field label="Campaign name" htmlFor="rename" error={error}>
              <Input id="rename" value={value} onChange={(e) => setValue(e.target.value)} maxLength={160} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Delete campaign permanently?" description="This removes the brief, research runs, evidence, strategies, experiments and reports for this campaign. Shared report links stop working. This cannot be undone.">
          <form onSubmit={(e) => { e.preventDefault(); run(() => deleteProjectAction(project.id, value), "Campaign deleted"); }} className="space-y-4">
            <Field label={`Type “${project.name}” to confirm`} htmlFor="confirm" error={error}>
              <Input id="confirm" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={pending || value.trim() !== project.name}>{pending ? "Deleting…" : "Delete campaign"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
