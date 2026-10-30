import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ConfigurationError, env } from "@/lib/env";
import type { AuthResult, SessionUser } from "./types";

export async function supabaseServer() {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ConfigurationError("Supabase URL and anon key are not configured");
  }
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export async function supabaseGetUser(): Promise<SessionUser | null> {
  const client = await supabaseServer();
  // getUser() validates the JWT with Supabase Auth rather than trusting the cookie.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

/**
 * Cheaper check for high-frequency, read-mostly endpoints (presence, status polling): verifies the
 * JWT signature locally when the project uses asymmetric signing keys, instead of an Auth server
 * round trip per request. Row Level Security still decides what the user can read or write.
 */
export async function supabaseGetClaimsUser(): Promise<SessionUser | null> {
  const client = await supabaseServer();
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  const email = data?.claims?.email;
  if (error || typeof sub !== "string" || typeof email !== "string") return null;
  return { id: sub, email };
}

export async function supabaseSignUp(input: { email: string; password: string; fullName: string; workspaceName?: string }): Promise<AuthResult> {
  const client = await supabaseServer();
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, workspace_name: input.workspaceName ?? "" },
      emailRedirectTo: `${env().APP_BASE_URL}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function supabaseSignIn(email: string, password: string): Promise<AuthResult> {
  const client = await supabaseServer();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Email or password is incorrect, or the email is not yet verified." };
  return { ok: true };
}

export async function supabaseSignOut() {
  const client = await supabaseServer();
  await client.auth.signOut();
}

export async function supabaseResetPassword(email: string): Promise<AuthResult> {
  const client = await supabaseServer();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${env().APP_BASE_URL}/auth/callback?next=/settings/security%3Frecovery%3D1`,
  });
  if (error) return { ok: false, error: "We could not start password recovery. Try again shortly." };
  return { ok: true };
}

export async function supabaseUpdatePassword(password: string): Promise<AuthResult> {
  const client = await supabaseServer();
  const { error } = await client.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
