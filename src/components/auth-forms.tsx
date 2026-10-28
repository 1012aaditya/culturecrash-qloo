"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, signInAction, signUpAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function Alert({ state }: { state: FormState }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={state.error ? "rounded-cc-sm bg-danger/8 p-3 text-[13px] text-danger" : "rounded-cc-sm bg-success/10 p-3 text-[13px] text-success"}>
      {state.error ?? state.message}
    </p>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Alert state={state} />
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state?.fieldErrors?.email)} />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-muted hover:text-ink">Forgot password?</Link>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alert state={state} />
      <Field label="Full name" htmlFor="fullName" error={state?.fieldErrors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>
      <Field label="Work email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Agency or team name" htmlFor="workspaceName" optional hint="Becomes your workspace name. You can change it later.">
        <Input id="workspaceName" name="workspaceName" autoComplete="organization" />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      <p className="text-[12px] leading-relaxed text-muted">
        By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and acknowledge the <Link href="/privacy" className="underline">Privacy policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alert state={state} />
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "Sending…" : "Send recovery link"}</Button>
    </form>
  );
}
