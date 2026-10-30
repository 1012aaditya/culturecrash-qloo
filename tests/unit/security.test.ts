import { describe, expect, it, vi } from "vitest";
import { robotsAllows } from "@/lib/research/deep/fetch-page";
import { isPrivateAddress } from "@/lib/research/deep/url";
import { safeInternalPath } from "@/lib/safe-path";
import { zipUncompressedBytes } from "@/lib/upload-guards";

describe("safeInternalPath (open redirects)", () => {
  it("keeps paths on this site", () => {
    expect(safeInternalPath("/projects/abc?run=1#top")).toBe("/projects/abc?run=1#top");
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
  });
  it("refuses anything a browser would send to another origin", () => {
    for (const bad of ["//evil.test", "/\\evil.test", "/\\/evil.test", "/\t/evil.test", "/\n/evil.test", "https://evil.test", "evil.test", "", null, undefined, 42]) {
      expect(safeInternalPath(bad)).toBe("/dashboard");
    }
    expect(safeInternalPath("//evil.test", "")).toBe("");
  });
});

describe("isPrivateAddress (SSRF)", () => {
  it("catches every spelling of internal IPv4 inside IPv6", () => {
    for (const ip of [
      "::ffff:a9fe:a9fe", // ::ffff:169.254.169.254 as the URL parser rewrites it
      "::ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1", "::127.0.0.1", "::",
      "64:ff9b::a9fe:a9fe", "64:ff9b:1::1", // NAT64
      "2002:a9fe:a9fe::1", "2002:7f00:1::", // 6to4
      "2001::1", "2001:db8::1", "100::1", "fe80::1", "fec0::1", "ff02::1", "fc00::1",
      "192.0.2.1", "198.51.100.7", "203.0.113.9", "192.88.99.1",
      "not-an-ip", "1::2::3",
    ]) expect(isPrivateAddress(ip), ip).toBe(true);
  });
  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:5db8:d822", "2002:5db8:d822::1", "64:ff9b::5db8:d822"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("robots.txt redirects to internal addresses are never fetched", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("169.254")
      ? new Response("User-agent: *\nDisallow: /", { status: 200 })
      : new Response(null, { status: 301, headers: { location: "http://[::ffff:169.254.169.254]/robots.txt" } })));
    const resolve = async () => [{ address: "93.184.216.34" }];
    await robotsAllows(new URL("https://robots-redirect.test/page"), fetcher, resolve);
    expect(fetcher.mock.calls.every(([u]) => !String(u).includes("a9fe") && !String(u).includes("169.254"))).toBe(true);
  });
});

/** A ZIP central directory with one entry declaring `size` uncompressed bytes (enough for the size check). */
function zipDeclaring(size: number) {
  const name = Buffer.from("word/document.xml");
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt32LE(size, 24);
  cd.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + name.length, 12);
  eocd.writeUInt32LE(4, 16);
  return Buffer.concat([Buffer.from("PK\u0003\u0004"), cd, name, eocd]);
}

describe("zipUncompressedBytes (DOCX zip bombs)", () => {
  it("reads declared sizes without inflating anything", () => {
    expect(zipUncompressedBytes(zipDeclaring(1234))).toBe(1234);
    expect(zipUncompressedBytes(zipDeclaring(4_000_000_000))).toBeGreaterThan(60 * 1024 * 1024);
  });
  it("rejects malformed archives and ZIP64", () => {
    expect(zipUncompressedBytes(Buffer.from("PK not really a zip"))).toBeNull();
    expect(zipUncompressedBytes(zipDeclaring(0xffffffff))).toBeNull();
  });
});
