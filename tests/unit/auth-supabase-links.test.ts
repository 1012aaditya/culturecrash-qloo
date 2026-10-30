import { beforeEach, describe, expect, it, vi } from "vitest";

// Sign-up and password reset must ask for links that work on any device (no PKCE) and land on /auth/complete.
const created: { options: { auth: Record<string, unknown> } }[] = [];
const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const setSession = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: { auth: Record<string, unknown> }) => {
    created.push({ options });
    return { auth: { signUp, resetPasswordForEmail } };
  },
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { setSession } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/env", () => ({
  env: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-0123456789", APP_BASE_URL: "https://app.test" }),
  ConfigurationError: class extends Error {},
}));

describe("email links work on any device", () => {
  beforeEach(() => { created.length = 0; signUp.mockReset(); resetPasswordForEmail.mockReset(); setSession.mockReset(); });

  it("sign-up asks for a non-PKCE link that returns to /auth/complete", async () => {
    const { supabaseSignUp } = await import("@/lib/auth/supabase");
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    expect(await supabaseSignUp({ email: "a@b.test", password: "pw-0123456789", fullName: "A" })).toEqual({ ok: true, needsEmailConfirmation: true });
    expect(created[0].options.auth).toMatchObject({ flowType: "implicit", persistSession: false });
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe("https://app.test/auth/complete?next=%2Fdashboard");
    expect(setSession).not.toHaveBeenCalled();
  });
  it("keeps an immediate session (projects without email confirmation) in the cookie session", async () => {
    const { supabaseSignUp } = await import("@/lib/auth/supabase");
    signUp.mockResolvedValue({ data: { session: { access_token: "AT", refresh_token: "RT" } }, error: null });
    expect(await supabaseSignUp({ email: "a@b.test", password: "pw-0123456789", fullName: "A" })).toEqual({ ok: true, needsEmailConfirmation: false });
    expect(setSession).toHaveBeenCalledWith({ access_token: "AT", refresh_token: "RT" });
  });
  it("password reset links land on /auth/complete and continue to the password page", async () => {
    const { supabaseResetPassword } = await import("@/lib/auth/supabase");
    resetPasswordForEmail.mockResolvedValue({ error: null });
    await supabaseResetPassword("a@b.test");
    expect(resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe("https://app.test/auth/complete?next=%2Fsettings%2Fsecurity%3Frecovery%3D1");
    expect(created[0].options.auth).toMatchObject({ flowType: "implicit" });
  });
});
