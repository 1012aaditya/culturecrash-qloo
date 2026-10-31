"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type RefObject } from "react";
import { finishSignUpAction, forgotPasswordAction, signInAction, signUpAction, type FormState } from "@/app/(auth)/actions";
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
  // Kept in memory only, so this tab can sign in by itself once the email link is confirmed anywhere.
  const credentials = useRef<{ email: string; password: string } | null>(null);
  useSignInWhenConfirmed(Boolean(state?.awaitingConfirmation), credentials);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        credentials.current = { email: String(f.get("email") ?? "").trim(), password: String(f.get("password") ?? "") };
      }}
      className="space-y-4"
      noValidate
    >
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

const CONFIRM_POLL_MS = 15_000;
const CONFIRM_GIVE_UP_MS = 30 * 60_000;

/** After sign-up, tries to sign in when the tab regains focus and every 15s, until the email is confirmed. */
function useSignInWhenConfirmed(waiting: boolean, credentials: RefObject<{ email: string; password: string } | null>) {
  useEffect(() => {
    const creds = credentials.current;
    if (!waiting || !creds) return;
    let done = false;
    let busy = false;
    const started = Date.now();
    const attempt = () => {
      if (done || busy || document.visibilityState !== "visible") return;
      if (Date.now() - started > CONFIRM_GIVE_UP_MS) return stop();
      busy = true;
      finishSignUpAction(creds.email, creds.password)
        .then((r) => {
          if (r.ok && !done) {
            stop();
            window.location.replace("/dashboard?welcome=1");
          }
        })
        .catch(() => {})
        .finally(() => { busy = false; });
    };
    const timer = window.setInterval(attempt, CONFIRM_POLL_MS);
    document.addEventListener("visibilitychange", attempt);
    window.addEventListener("focus", attempt);
    function stop() {
      done = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", attempt);
      window.removeEventListener("focus", attempt);
    }
    return stop;
  }, [waiting, credentials]);
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
