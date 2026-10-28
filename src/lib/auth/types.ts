export type SessionUser = { id: string; email: string };

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; error: string };
