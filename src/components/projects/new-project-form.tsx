"use client";

import { useActionState, useState } from "react";
import { createProjectAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function NewProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createProjectAction, undefined);
  const [clientMode, setClientMode] = useState(clients.length ? "existing" : "new");
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="mt-10 space-y-5" noValidate>
      {state && !state.ok && <p role="alert" className="rounded-cc-sm bg-danger/8 p-3 text-[13px] text-danger">{state.error}</p>}
      <Field label="Campaign name" htmlFor="name" error={fe?.name} hint="e.g. “Skincare Launch — India 2027”">
        <Input id="name" name="name" required maxLength={160} autoFocus />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Client</legend>
        <div className="flex gap-2 text-[13px]">
          {clients.length > 0 && (
            <label className="flex items-center gap-1.5"><input type="radio" checked={clientMode === "existing"} onChange={() => setClientMode("existing")} /> Existing</label>
          )}
          <label className="flex items-center gap-1.5"><input type="radio" checked={clientMode === "new"} onChange={() => setClientMode("new")} /> New client</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={clientMode === "none"} onChange={() => setClientMode("none")} /> Internal / none</label>
        </div>
        {clientMode === "existing" && (
          <Select name="clientId" aria-label="Client" defaultValue={clients[0]?.id}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        {clientMode === "new" && <Input name="newClientName" placeholder="Client name" aria-label="New client name" maxLength={160} />}
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Brand" htmlFor="brand" optional><Input id="brand" name="brand" maxLength={160} /></Field>
        <Field label="Product category" htmlFor="category" optional hint="Shapes which cultural domains we research."><Input id="category" name="category" maxLength={120} placeholder="Skincare" /></Field>
      </div>
      <Field label="Market & geography" htmlFor="market" optional hint="Used as a location signal where the provider supports it."><Input id="market" name="market" maxLength={160} placeholder="India" /></Field>
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Creating…" : "Create and open brief"}</Button>
        <p className="text-[12px] text-muted">You can change all of this later.</p>
      </div>
    </form>
  );
}
