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

/** True for loopback, private, link-local, CGNAT, documentation, multicast and reserved addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  // IPv6 is compared on its eight 16-bit groups, so every spelling of an address is caught
  // (the URL parser rewrites [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe], for example).
  const g = ipv6Groups(ip);
  if (!g) return true;
  const embeddedV4 = (hi: number, lo: number) => isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return g[5] === 0 && g[6] === 0 && g[7] <= 1 ? true : embeddedV4(g[6], g[7]); // :: and ::1, mapped and compatible v4
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || embeddedV4(g[6], g[7]); // NAT64 (well-known and local-use)
  if (g[0] === 0x2002) return embeddedV4(g[1], g[2]); // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo, documentation
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || g[0] >> 8 === 0xff;
}

/** Expands an IPv6 address (with optional trailing dotted IPv4) to eight groups; null if malformed. */
function ipv6Groups(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const dotted = v.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [p1, p2, p3, p4] = dotted.slice(2).map(Number);
    if ([p1, p2, p3, p4].some((n) => n > 255)) return null;
    v = `${dotted[1]}${((p1 << 8) | p2).toString(16)}:${((p3 << 8) | p4).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (parts.length !== 8 || parts.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map((x) => parseInt(x, 16));
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
