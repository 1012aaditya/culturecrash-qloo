import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { privilegedSql } from "@/lib/db";
import { ConfigurationError, env } from "@/lib/env";
import type { AuthResult, SessionUser } from "./types";

/**
 * LOCAL AUTH MODE — for development and automated tests against plain Postgres,
 * where Supabase Auth (GoTrue) is not running. Enabled only with AUTH_MODE=local and
 * refused on Vercel production deployments. Supabase Auth is the production provider.
 */
export const LOCAL_SESSION_COOKIE = "cc_local_session";

function secret() {
  const e = env();
  if (e.VERCEL_ENV === "production") throw new ConfigurationError("Local auth is disabled in production");
  if (!e.SESSION_SECRET) throw new ConfigurationError("SESSION_SECRET is required for AUTH_MODE=local");
  return new TextEncoder().encode(e.SESSION_SECRET);
}

async function issue(user: SessionUser) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function verifyLocalToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function localGetUser(): Promise<SessionUser | null> {
  const user = await verifyLocalToken((await cookies()).get(LOCAL_SESSION_COOKIE)?.value);
  if (!user) return null;
  // The account must still exist (deleted users lose access immediately).
  const rows = await privilegedSql()`select id from auth.users where id = ${user.id}`;
  return rows.length ? user : null;
}

export async function localSignUp(input: { email: string; password: string; fullName: string; workspaceName?: string }): Promise<AuthResult> {
  const sql = privilegedSql();
  const email = input.email.trim().toLowerCase();
  const existing = await sql`select 1 from auth.users where email = ${email}`;
  if (existing.length) return { ok: false, error: "An account with this email already exists." };
  const hash = await bcrypt.hash(input.password, 11);
  const meta = { full_name: input.fullName, workspace_name: input.workspaceName ?? "" };
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values (${email}, ${hash}, ${sql.json(meta)}) returning id`;
  await issue({ id: row.id, email });
  return { ok: true };
}

export async function localSignIn(emailInput: string, password: string): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase();
  const [row] = await privilegedSql()<{ id: string; encrypted_password: string | null }[]>`
    select id, encrypted_password from auth.users where email = ${email}`;
  // Constant-ish work whether or not the user exists.
  const ok = await bcrypt.compare(password, row?.encrypted_password ?? "$2b$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!row || !ok) return { ok: false, error: "Email or password is incorrect." };
  await issue({ id: row.id, email });
  return { ok: true };
}

export async function localSignOut() {
  (await cookies()).delete(LOCAL_SESSION_COOKIE);
}

export async function localUpdatePassword(userId: string, password: string): Promise<AuthResult> {
  const hash = await bcrypt.hash(password, 11);
  await privilegedSql()`update auth.users set encrypted_password = ${hash}, updated_at = now() where id = ${userId}`;
  return { ok: true };
}

export async function localDeleteAccount(userId: string) {
  await privilegedSql()`delete from auth.users where id = ${userId}`;
  await localSignOut();
}
