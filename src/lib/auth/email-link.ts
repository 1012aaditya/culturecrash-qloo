/**
 * Supabase email links without PKCE return the session (or an error) in the URL fragment:
 * `#access_token=…&refresh_token=…&type=signup` or `#error=…&error_description=…`. Pure, so it's tested.
 */
export type EmailLinkFragment =
  | { kind: "session"; accessToken: string; refreshToken: string; type: string | null }
  | { kind: "error"; description: string }
  | { kind: "none" };

export function parseEmailLinkFragment(hash: string): EmailLinkFragment {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const error = p.get("error_description") ?? p.get("error");
  if (error) return { kind: "error", description: error.replace(/\+/g, " ") };
  const accessToken = p.get("access_token");
  const refreshToken = p.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken, type: p.get("type") };
  return { kind: "none" };
}

/** Where a link that landed somewhere other than /auth/complete should continue to. */
export function nextForLinkType(type: string | null): string {
  return type === "recovery" ? "/settings/security?recovery=1" : "/dashboard";
}
