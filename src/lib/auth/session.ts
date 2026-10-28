import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { localGetUser } from "./local";
import { supabaseGetUser } from "./supabase";
import type { SessionUser } from "./types";

/** Verified current user for this request, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return env().AUTH_MODE === "local" ? await localGetUser() : await supabaseGetUser();
  } catch (error) {
    console.error("[auth] session lookup failed:", error instanceof Error ? error.message : "unknown");
    return null;
  }
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
