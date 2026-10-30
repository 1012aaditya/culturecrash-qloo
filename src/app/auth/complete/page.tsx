"use client";

import * as React from "react";
import { parseEmailLinkFragment } from "@/lib/auth/email-link";
import { completeEmailLinkAction } from "./actions";

/**
 * Landing page for email links (sign-up confirmation, password reset). The session arrives in the URL
 * fragment, which only the browser can read; it's handed to the server once and removed from the address bar.
 */
export default function CompleteEmailLinkPage() {
  React.useEffect(() => {
    const link = parseEmailLinkFragment(window.location.hash);
    const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard";
    window.history.replaceState(null, "", window.location.pathname + window.location.search); // tokens out of the address bar and history
    if (link.kind !== "session") {
      window.location.replace("/login?error=link");
      return;
    }
    completeEmailLinkAction(link.accessToken, link.refreshToken, next)
      .then((r) => window.location.replace(r.next))
      .catch(() => window.location.replace("/login?error=link"));
  }, []);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <p className="text-[14px] text-muted" role="status">Signing you in…</p>
    </main>
  );
}
