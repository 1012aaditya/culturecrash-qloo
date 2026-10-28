"use client";

import { Download, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { changePasswordAction, deleteAccountAction } from "@/lib/data/settings-actions";
import { FormStatus } from "./form-status";

export function PasswordForm({ recovery }: { recovery: boolean }) {
  const { toast } = useToast();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePasswordAction({ current: current || undefined, next, confirm, recovery });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setStatus({ error: r.error });
            return;
          }
          setErrors({});
          setCurrent("");
          setNext("");
          setConfirm("");
          setStatus({ success: r.message });
          toast({ tone: "success", title: "Password updated" });
        });
      }}
    >
      {!recovery && (
        <Field label="Current password" htmlFor="pw-current" error={errors.current}>
          <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required aria-invalid={Boolean(errors.current)} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="pw-next" error={errors.next} hint="At least 10 characters.">
          <Input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} maxLength={200} required aria-invalid={Boolean(errors.next)} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm}>
          <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={Boolean(errors.confirm)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !next || !confirm || (!recovery && !current)}>{pending ? "Updating…" : "Update password"}</Button>
        <FormStatus error={Object.keys(errors).length ? null : status.error} success={status.success} />
      </div>
    </form>
  );
}

export function ExportData() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild variant="outline">
        <a href="/api/account/export" download><Download /> Export my data (JSON)</a>
      </Button>
      <span className="text-[12px] text-muted">Profile, memberships, your activity, comments, copilot conversations and feedback.</span>
    </div>
  );
}

export function DeleteAccount({ email, mode, blocking }: { email: string; mode: "local" | "supabase"; blocking: { name: string; members: number }[] }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (mode !== "local") {
    return (
      <p className="rounded-cc-sm border border-line bg-paper p-4 text-[13px] leading-relaxed text-muted">
        In this deployment accounts are managed by Supabase Auth. Self-service deletion isn’t available yet: export your data above, then ask
        a workspace administrator to delete your user in the Supabase dashboard (Authentication → Users). Deleting the user removes your
        profile and memberships; workspace records you created remain with their workspace.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blocking.length > 0 && (
        <p role="alert" className="rounded-cc-sm border border-warning/25 bg-warning/[0.06] p-3 text-[13px] text-ink">
          You’re the only owner of {blocking.map((b) => `“${b.name}” (${b.members} members)`).join(", ")}. Make another member an owner in Team settings
          before deleting your account.
        </p>
      )}
      <Button variant="danger" onClick={() => { setValue(""); setError(null); setOpen(true); }} disabled={blocking.length > 0}>
        <Trash2 /> Delete my account…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Delete your account permanently?"
          description="Your profile, memberships, copilot conversations and feedback are deleted. Workspaces where you are the only member are deleted with everything in them. This cannot be undone."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await deleteAccountAction(value);
                if (r && !r.ok) setError(r.error);
              });
            }}
          >
            <Field label={`Type ${email} to confirm`} htmlFor="delete-confirm" error={error}>
              <Input id="delete-confirm" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus aria-invalid={Boolean(error)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={pending || value.trim().toLowerCase() !== email.toLowerCase()}>
                {pending ? "Deleting…" : "Delete account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
