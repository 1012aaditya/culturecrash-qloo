"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/lib/data/settings-actions";
import { FormStatus } from "./form-status";

export function ProfileForm({ initial }: { initial: { fullName: string; jobTitle: string; email: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = React.useState(initial.fullName);
  const [jobTitle, setJobTitle] = React.useState(initial.jobTitle);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();
  const dirty = fullName !== initial.fullName || jobTitle !== initial.jobTitle;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfileAction({ fullName, jobTitle });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setStatus({ error: r.error });
            return;
          }
          setErrors({});
          setStatus({ success: "Profile saved." });
          toast({ tone: "success", title: "Profile saved" });
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" required aria-invalid={Boolean(errors.fullName)} />
        </Field>
        <Field label="Job title" htmlFor="jobTitle" error={errors.jobTitle} optional hint="Shown to teammates next to your name.">
          <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} autoComplete="organization-title" aria-invalid={Boolean(errors.jobTitle)} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" hint="Your sign-in email can’t be changed here.">
        <Input id="email" value={initial.email} readOnly disabled />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save profile"}</Button>
        <FormStatus error={status.error} success={status.success} />
      </div>
    </form>
  );
}
