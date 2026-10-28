"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createClientAction, deleteClientAction, updateClientAction } from "@/lib/data/client-actions";

type Values = { name: string; industry: string; website: string; notes: string };
const empty: Values = { name: "", industry: "", website: "", notes: "" };

function ClientFields({ v, set, errors, idPrefix }: { v: Values; set: (v: Values) => void; errors: Record<string, string>; idPrefix: string }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="space-y-4">
      <Field label="Client name" htmlFor={id("name")} error={errors.name}>
        <Input id={id("name")} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} maxLength={160} required aria-invalid={Boolean(errors.name)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" htmlFor={id("industry")} error={errors.industry} optional>
          <Input id={id("industry")} value={v.industry} onChange={(e) => set({ ...v, industry: e.target.value })} maxLength={120} placeholder="e.g. Skincare" />
        </Field>
        <Field label="Website" htmlFor={id("website")} error={errors.website} optional>
          <Input id={id("website")} value={v.website} onChange={(e) => set({ ...v, website: e.target.value })} maxLength={300} placeholder="example.com" inputMode="url" aria-invalid={Boolean(errors.website)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor={id("notes")} error={errors.notes} optional hint="Context the team should know: stakeholders, sensitivities, how they like to work.">
        <Textarea id={id("notes")} value={v.notes} onChange={(e) => set({ ...v, notes: e.target.value })} maxLength={4000} rows={4} />
      </Field>
    </div>
  );
}

export function NewClientButton({ size = "lg" }: { size?: "md" | "lg" | "sm" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<Values>(empty);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button size={size} onClick={() => { setV(empty); setErrors({}); setError(null); setOpen(true); }}><Plus /> New client</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New client" description="Clients group campaigns, past reports and brand memory. Everything stays inside this workspace.">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createClientAction(v);
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  setError(r.fieldErrors ? null : r.error);
                  return;
                }
                setOpen(false);
                toast({ tone: "success", title: `Client “${v.name.trim()}” added` });
                router.push(`/workspace/clients/${r.data!.id}`);
              });
            }}
          >
            <ClientFields v={v} set={setV} errors={errors} idPrefix="new-client" />
            <FormStatus error={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !v.name.trim()}>{pending ? "Adding…" : "Add client"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClientDetailsForm({ clientId, initial }: { clientId: string; initial: Values }) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState<Values>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((k) => initial[k] !== v[k]);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateClientAction(clientId, v);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setStatus({ error: r.fieldErrors ? undefined : r.error });
            return;
          }
          setErrors({});
          setStatus({ success: "Details saved." });
          toast({ tone: "success", title: "Client details saved" });
          router.refresh();
        });
      }}
    >
      <ClientFields v={v} set={setV} errors={errors} idPrefix="client" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !dirty || !v.name.trim()}>{pending ? "Saving…" : "Save details"}</Button>
        <FormStatus error={status.error} success={status.success} />
      </div>
    </form>
  );
}

export function DeleteClientButton({ clientId, name, projectCount, redirectTo }: { clientId: string; name: string; projectCount: number; redirectTo?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/5" onClick={() => { setValue(""); setError(null); setOpen(true); }} aria-label={`Delete ${name}`}>
        <Trash2 /> Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Delete “${name}”?`}
          description={`This permanently deletes the client and its brand memory. ${projectCount ? `Its ${projectCount} campaign${projectCount === 1 ? "" : "s"} are kept but no longer linked to a client.` : "It has no campaigns."} This cannot be undone.`}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await deleteClientAction(clientId, value);
                if (!r.ok) return setError(r.error);
                setOpen(false);
                toast({ tone: "success", title: `Client “${name}” deleted` });
                if (redirectTo) router.push(redirectTo);
                else router.refresh();
              });
            }}
          >
            <Field label={`Type “${name}” to confirm`} htmlFor={`del-${clientId}`} error={error}>
              <Input id={`del-${clientId}`} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={pending || value.trim() !== name}>{pending ? "Deleting…" : "Delete client"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
