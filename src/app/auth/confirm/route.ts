import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/auth/supabase";
import { safeInternalPath } from "@/lib/safe-path";

const TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Supabase email links (sign-up confirmation, password recovery, email change) in the token-hash form.
 * Unlike the PKCE code in /auth/callback, a token hash carries everything needed to verify it, so the
 * link works on any device — a phone opening an email sent from a laptop sign-up included. Requires the
 * Supabase email templates to link here (see docs/SUPABASE_EMAIL_TEMPLATES.md).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(url.searchParams.get("next"));
  if (tokenHash && type && TYPES.includes(type)) {
    try {
      const supabase = await supabaseServer();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } catch {
      // fall through
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
