"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { localSignIn, localSignOut, localSignUp } from "@/lib/auth/local";
import { supabaseResetPassword, supabaseSignIn, supabaseSignOut, supabaseSignUp } from "@/lib/auth/supabase";

export type FormState = { error?: string; message?: string; fieldErrors?: Record<string, string> } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Tell us your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  workspaceName: z.string().trim().max(120).optional(),
});

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message]));
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  let result;
  try {
    result = env().AUTH_MODE === "local" ? await localSignUp(parsed.data) : await supabaseSignUp(parsed.data);
  } catch {
    return { error: "Sign-up is unavailable: authentication is not configured on this server." };
  }
  if (!result.ok) return { error: result.error };
  if (result.needsEmailConfirmation) {
    return { message: "Check your inbox to verify your email, then sign in." };
  }
  redirect("/dashboard?welcome=1");
}

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  let result;
  try {
    result = env().AUTH_MODE === "local"
      ? await localSignIn(parsed.data.email, parsed.data.password)
      : await supabaseSignIn(parsed.data.email, parsed.data.password);
  } catch {
    return { error: "Sign-in is unavailable: authentication is not configured on this server." };
  }
  if (!result.ok) return { error: result.error };
  redirect(safeNext(form.get("next")));
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return { fieldErrors: { email: "Enter a valid email" } };
  if (env().AUTH_MODE === "local") {
    return {
      error: "Password recovery emails need Supabase Auth. This server runs local development auth, which has no email delivery.",
    };
  }
  const result = await supabaseResetPassword(email.data);
  if (!result.ok) return { error: result.error };
  // Same message whether or not the account exists.
  return { message: "If an account exists for that email, a recovery link is on its way." };
}

export async function signOutAction() {
  if (env().AUTH_MODE === "local") await localSignOut();
  else await supabaseSignOut();
  redirect("/login");
}
