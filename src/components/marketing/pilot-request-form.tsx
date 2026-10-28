"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { requestPilotAction, type PilotRequestState } from "@/app/(marketing)/pricing/actions";
import { TEAM_SIZES } from "@/app/(marketing)/pricing/team-sizes";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const initial: PilotRequestState = { status: "idle" };

export function PilotRequestForm() {
  const [state, action, pending] = useActionState(requestPilotAction, initial);
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const v = state.status === "error" ? (state.values ?? {}) : {};

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-cc-lg border border-line bg-paper p-8">
        <span className="flex size-11 items-center justify-center rounded-full bg-lilac/70 text-violet-ink">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="cc-display text-3xl">Request received.</p>
        <p className="max-w-md text-[14px] leading-relaxed text-muted">{state.message}</p>
        <p className="max-w-md text-[13px] leading-relaxed text-muted">
          Nothing is charged and no payment details are collected. While you wait, you can{" "}
          <Link href="/signup" className="text-ink underline underline-offset-2">create a workspace</Link> or browse the{" "}
          <Link href="/showcase" className="text-ink underline underline-offset-2">showcase</Link>.
        </p>
      </div>
    );
  }

  return (
    <form key={state.status === "error" ? state.attempt : "initial"} action={action} noValidate className="relative space-y-5 rounded-cc-lg border border-line bg-paper p-6 shadow-card sm:p-8">
      {state.status === "error" && (
        <p role="alert" className="rounded-cc-sm bg-danger/8 p-3 text-[13px] text-danger">
          {state.message}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="pilot-name" error={fe.name}>
          <Input id="pilot-name" name="name" defaultValue={v.name} autoComplete="name" required maxLength={120} aria-invalid={Boolean(fe.name)} />
        </Field>
        <Field label="Work email" htmlFor="pilot-email" error={fe.email}>
          <Input id="pilot-email" name="email" defaultValue={v.email} type="email" autoComplete="email" required maxLength={254} aria-invalid={Boolean(fe.email)} />
        </Field>
        <Field label="Agency or company" htmlFor="pilot-company" error={fe.company}>
          <Input id="pilot-company" name="company" defaultValue={v.company} autoComplete="organization" required maxLength={160} aria-invalid={Boolean(fe.company)} />
        </Field>
        <Field label="Team size" htmlFor="pilot-team" optional error={fe.teamSize}>
          <Select id="pilot-team" name="teamSize" defaultValue={v.teamSize ?? ""} aria-invalid={Boolean(fe.teamSize)}>
            <option value="">Select…</option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="What would you run the pilot on?"
        htmlFor="pilot-message"
        optional
        error={fe.message}
        hint="A live brief, a pitch, a category you want to understand. Please don't include confidential client details yet."
      >
        <Textarea id="pilot-message" name="message" defaultValue={v.message} maxLength={2000} rows={4} aria-invalid={Boolean(fe.message)} />
      </Field>

      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="pilot-website">Website</label>
        <input id="pilot-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-[12px] leading-relaxed text-muted">
          We store these details only to respond to your request. See the{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
        </p>
        <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
          {pending ? "Sending…" : (<>Request a pilot <ArrowRight /></>)}
        </Button>
      </div>
    </form>
  );
}
