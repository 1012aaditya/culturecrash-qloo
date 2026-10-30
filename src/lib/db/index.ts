import "server-only";
import postgres from "postgres";
import { ConfigurationError, env } from "@/lib/env";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

declare global {
  var __ccSql: postgres.Sql | undefined;
}

function client(): postgres.Sql {
  if (globalThis.__ccSql) return globalThis.__ccSql;
  const url = env().DATABASE_URL;
  if (!url) throw new ConfigurationError("DATABASE_URL is not configured");
  // prepare:false keeps us compatible with Supabase's transaction pooler (Supavisor).
  globalThis.__ccSql = postgres(url, {
    max: env().DATABASE_POOL_MAX,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    transform: { undefined: null },
  });
  return globalThis.__ccSql;
}

/**
 * Runs `fn` in a transaction as the Postgres `authenticated` role with the verified
 * user id as JWT subject, exactly like Supabase's Data API does. Row Level Security
 * therefore applies to every statement, independently of application checks.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("invalid user id");
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const result = await client().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
  return result as T;
}

/** Anonymous role: only the shared-report RPC is granted to it. */
export async function withAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await client().begin(async (tx) => {
    await tx.unsafe("set local role anon");
    return fn(tx);
  });
  return result as T;
}

/**
 * Privileged connection (bypasses RLS). Restricted to authentication bookkeeping
 * in local auth mode; never call it with user-controlled identifiers without
 * an explicit authorization check first.
 */
export function privilegedSql(): postgres.Sql {
  return client();
}
