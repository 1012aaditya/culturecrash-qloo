"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createWorkspaceAction, deleteWorkspaceAction, renameWorkspaceAction, updateRetentionAction } from "@/lib/data/settings-actions";
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

const RETENTION = [
  { value: "", label: "Keep until deleted" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
];

export function RetentionForm({ days, canManage }: { days: number | null; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(days ? String(days) : "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateRetentionAction(value ? Number(value) : null);
          if (!r.ok) return setError(r.error);
          setError(null);
          toast({ tone: "success", title: "Retention updated" });
          router.refresh();
        });
      }}
    >
      <Field label="Automatic cleanup after" htmlFor="ws-retention" className="flex-1" error={error}
        hint="Applies daily to raw provider responses, copilot conversations, activity history and finished tasks. Campaigns, evidence and reports are kept.">
        <Select id="ws-retention" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canManage}>
          {RETENTION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      {canManage && <Button type="submit" variant="outline" disabled={pending || value === (days ? String(days) : "")} className="sm:mb-[22px]">{pending ? "Saving…" : "Save"}</Button>}
    </form>
  );
}

export function DeleteWorkspace({ name, onlyWorkspace }: { name: string; onlyWorkspace: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {onlyWorkspace && (
        <p className="text-[13px] text-muted">This is your only workspace. Create another workspace first, or delete your account from Security settings.</p>
      )}
      <Button variant="danger" disabled={onlyWorkspace} onClick={() => { setValue(""); setError(null); setOpen(true); }}>
        <Trash2 /> Delete this workspace…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Delete “${name}” permanently?`}
          description="Every client, campaign, brief, uploaded file, research run, evidence item, strategy, experiment, report and share link in this workspace is deleted for all members. This cannot be undone."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await deleteWorkspaceAction(value);
                if (r && !r.ok) setError(r.error);
              });
            }}
          >
            <Field label={`Type ${name} to confirm`} htmlFor="ws-delete-confirm" error={error}>
              <Input id="ws-delete-confirm" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus aria-invalid={Boolean(error)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={pending || value.trim() !== name}>{pending ? "Deleting…" : "Delete workspace"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
