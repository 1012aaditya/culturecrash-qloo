"use client";

import * as React from "react";
import { nextForLinkType, parseEmailLinkFragment } from "@/lib/auth/email-link";

/**
 * If Supabase sends an email link to the Site URL instead of /auth/complete (it does when the redirect
 * address isn't on the project's allow list), pass the fragment on so the link still signs the person in.
 */
export function EmailLinkForwarder() {
  React.useEffect(() => {
    if (window.location.pathname === "/auth/complete") return;
    const link = parseEmailLinkFragment(window.location.hash);
    if (link.kind === "none") return;
    const next = link.kind === "session" ? nextForLinkType(link.type) : "/dashboard";
    window.location.replace(`/auth/complete?next=${encodeURIComponent(next)}${window.location.hash}`);
  }, []);
  return null;
}
