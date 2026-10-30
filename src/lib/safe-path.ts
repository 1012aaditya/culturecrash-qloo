const BASE = "http://culturecrash.invalid";

/**
 * Returns `next` only when it is a path on this site, otherwise `fallback`. Browsers treat
 * `/\evil.com` and tab/newline tricks like `//evil.com`, so the value is parsed as a URL and must
 * keep our own origin; backslashes are refused outright.
 */
export function safeInternalPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.includes("\\")) return fallback;
  try {
    const u = new URL(next, BASE);
    if (u.origin !== BASE) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
