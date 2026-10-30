import "server-only";
import { cache } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { env } from "@/lib/env";
import { localGetUser } from "./local";
import { supabaseGetClaimsUser, supabaseGetUser } from "./supabase";
import type { SessionUser } from "./types";

/** Verified current user for this request, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return env().AUTH_MODE === "local" ? await localGetUser() : await supabaseGetUser();
  } catch (error) {
    // Next.js signals (dynamic rendering, redirects) must pass through, not be logged as auth failures.
    unstable_rethrow(error);
    console.error("[auth] session lookup failed:", error instanceof Error ? error.message : "unknown");
    return null;
  }
});

/**
 * For endpoints polled every few seconds: the signed session token is verified without asking the
 * Auth server each time. Use getSessionUser for anything that changes account or workspace state.
 */
export const getPollingUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return env().AUTH_MODE === "local" ? await localGetUser() : await supabaseGetClaimsUser();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
