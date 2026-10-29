import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TRACKING = /^(utm_|fbclid$|gclid$|dclid$|msclkid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|cmpid$|ocid$|_hsenc$|_hsmi$|spm$)/i;

/**
 * Canonical form used for deduplication: https, lowercase host without "www.", no fragment,
 * no tracking parameters, sorted query, no trailing slash, AMP paths collapsed.
 * Returns null for anything that is not an http(s) URL.
 */
export function canonicalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.protocol = "https:";
  u.hash = "";
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\.(?=[^.]+\.[^.]+$)/, "");
  if ((u.port === "443" || u.port === "80")) u.port = "";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
  let path = u.pathname.replace(/\/amp\/?$/i, "/").replace(/\/+$/, "");
  if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length);
  u.pathname = path || "/";
  const s = u.toString();
  return u.pathname === "/" && !u.search ? s.replace(/\/$/, "") : s;
}

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

/**
 * SSRF guard for page retrieval: only public https/http hosts on default ports, and every
 * resolved address must be public. Called before each fetch and each redirect hop.
 */
export async function assertPublicUrl(url: string, resolve: (h: string) => Promise<{ address: string }[]> = (h) => lookup(h, { all: true })): Promise<URL> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs can be retrieved");
  if (u.port && u.port !== "443" && u.port !== "80") throw new Error("Non-standard ports are not retrieved");
  if (u.username || u.password) throw new Error("URLs with credentials are not retrieved");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new Error("Private hosts are not retrieved");
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host);
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Private or unresolvable addresses are not retrieved");
  return u;
}
