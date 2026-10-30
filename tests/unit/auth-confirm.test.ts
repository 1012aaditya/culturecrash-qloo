import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/auth/supabase", () => ({ supabaseServer: async () => ({ auth: { verifyOtp } }) }));

const get = async (query: string) => {
  const { GET } = await import("@/app/auth/confirm/route");
  const res = await GET(new NextRequest(`https://culturecrash.test/auth/confirm?${query}`));
  return res.headers.get("location");
};

describe("email links that work on any device (/auth/confirm)", () => {
  beforeEach(() => verifyOtp.mockReset());

  it("verifies the token hash and continues to the requested page", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    expect(await get("token_hash=abc123&type=email&next=/dashboard")).toBe("https://culturecrash.test/dashboard");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc123" });
    expect(await get("token_hash=abc123&type=recovery&next=%2Fsettings%2Fsecurity%3Frecovery%3D1")).toBe("https://culturecrash.test/settings/security?recovery=1");
  });
  it("never redirects off the site", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    expect(await get("token_hash=abc123&type=email&next=//evil.test/phish")).toBe("https://culturecrash.test/dashboard");
  });
  it("sends expired, tampered or incomplete links to sign-in with an explanation", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    expect(await get("token_hash=old&type=email")).toBe("https://culturecrash.test/login?error=link");
    expect(await get("type=email")).toBe("https://culturecrash.test/login?error=link");
    expect(await get("token_hash=abc&type=sms")).toBe("https://culturecrash.test/login?error=link");
    expect(verifyOtp).toHaveBeenCalledTimes(1); // only the well-formed link reached Supabase
  });
});
