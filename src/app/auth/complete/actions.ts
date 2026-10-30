"use server";

import { supabaseCompleteEmailLink } from "@/lib/auth/supabase";
import { env } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-path";

/**
 * Turns the tokens from an email link into the cookie session. Supabase Auth checks them before
 * they're stored, so made-up tokens fail. Returns where to go next (always a path on this site).
 */
export async function completeEmailLinkAction(accessToken: string, refreshToken: string, next: string): Promise<{ ok: boolean; next: string }> {
  if (env().AUTH_MODE !== "supabase" || typeof accessToken !== "string" || typeof refreshToken !== "string" || accessToken.length > 8000 || refreshToken.length > 2000) {
    return { ok: false, next: "/login?error=link" };
  }
  const r = await supabaseCompleteEmailLink(accessToken, refreshToken);
  return r.ok ? { ok: true, next: safeInternalPath(next) } : { ok: false, next: "/login?error=link" };
}
