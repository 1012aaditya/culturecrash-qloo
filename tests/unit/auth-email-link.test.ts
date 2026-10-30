import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextForLinkType, parseEmailLinkFragment } from "@/lib/auth/email-link";

describe("email link fragments", () => {
  it("reads a session from a confirmation or recovery link", () => {
    expect(parseEmailLinkFragment("#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=signup")).toEqual({ kind: "session", accessToken: "AT", refreshToken: "RT", type: "signup" });
    expect(parseEmailLinkFragment("#access_token=AT&refresh_token=RT&type=recovery")).toMatchObject({ type: "recovery" });
  });
  it("reads Supabase's error form and ignores ordinary anchors", () => {
    expect(parseEmailLinkFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"))
      .toEqual({ kind: "error", description: "Email link is invalid or has expired" });
    expect(parseEmailLinkFragment("#main")).toEqual({ kind: "none" });
    expect(parseEmailLinkFragment("")).toEqual({ kind: "none" });
    expect(parseEmailLinkFragment("#access_token=AT")).toEqual({ kind: "none" }); // no refresh token: not usable
  });
  it("sends password resets to the password page and everything else to the dashboard", () => {
    expect(nextForLinkType("recovery")).toBe("/settings/security?recovery=1");
    expect(nextForLinkType("signup")).toBe("/dashboard");
    expect(nextForLinkType(null)).toBe("/dashboard");
  });
});

const complete = vi.fn();
vi.mock("@/lib/auth/supabase", () => ({ supabaseCompleteEmailLink: (...a: unknown[]) => complete(...a) }));
const mode = vi.hoisted(() => ({ value: "supabase" }));
vi.mock("@/lib/env", () => ({ env: () => ({ AUTH_MODE: mode.value }) }));

describe("completing an email link", () => {
  beforeEach(() => { complete.mockReset(); mode.value = "supabase"; });
  it("stores the session and continues to an on-site page only", async () => {
    const { completeEmailLinkAction } = await import("@/app/auth/complete/actions");
    complete.mockResolvedValue({ ok: true });
    expect(await completeEmailLinkAction("AT", "RT", "/dashboard")).toEqual({ ok: true, next: "/dashboard" });
    expect(complete).toHaveBeenCalledWith("AT", "RT");
    expect(await completeEmailLinkAction("AT", "RT", "https://evil.test/")).toEqual({ ok: true, next: "/dashboard" });
  });
  it("refuses tokens Supabase rejects, oversized input, and local auth mode", async () => {
    const { completeEmailLinkAction } = await import("@/app/auth/complete/actions");
    complete.mockResolvedValue({ ok: false, error: "bad" });
    expect(await completeEmailLinkAction("forged", "RT", "/dashboard")).toEqual({ ok: false, next: "/login?error=link" });
    expect(await completeEmailLinkAction("x".repeat(9000), "RT", "/dashboard")).toEqual({ ok: false, next: "/login?error=link" });
    mode.value = "local";
    expect(await completeEmailLinkAction("AT", "RT", "/dashboard")).toEqual({ ok: false, next: "/login?error=link" });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
