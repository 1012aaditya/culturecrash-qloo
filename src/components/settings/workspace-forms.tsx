"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createWorkspaceAction, renameWorkspaceAction } from "@/lib/data/settings-actions";
import { FormStatus } from "./form-status";

export function RenameWorkspaceForm({ name, canManage }: { name: string; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(name);
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await renameWorkspaceAction(value);
          if (!r.ok) return setStatus({ error: r.error });
          setStatus({ success: "Workspace renamed." });
          toast({ tone: "success", title: "Workspace renamed" });
          router.refresh();
        });
      }}
    >
      <Field label="Workspace name" htmlFor="ws-name" className="flex-1" error={status.error}>
        <Input id="ws-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} disabled={!canManage} aria-invalid={Boolean(status.error)} />
      </Field>
      {canManage && <Button type="submit" disabled={pending || value.trim() === name || !value.trim()}>{pending ? "Saving…" : "Rename"}</Button>}
      {status.success && <FormStatus success={status.success} />}
    </form>
  );
}

export function CreateWorkspaceForm() {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          // On success the action switches workspace and redirects.
          const r = await createWorkspaceAction(value);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="New workspace name" htmlFor="ws-new" className="flex-1" error={error} hint="You’ll be its owner. Projects and clients are never shared between workspaces.">
        <Input id="ws-new" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} placeholder="e.g. Northbound Studio" aria-invalid={Boolean(error)} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending || !value.trim()} className="sm:mb-[22px]">{pending ? "Creating…" : "Create workspace"}</Button>
    </form>
  );
}
