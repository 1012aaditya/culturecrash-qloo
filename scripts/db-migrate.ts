/**
 * Applies SQL migrations to the database in DATABASE_URL.
 *   npx tsx scripts/db-migrate.ts            # supabase/migrations only (Supabase projects)
 *   npx tsx scripts/db-migrate.ts --local    # also applies db/local shim first (plain Postgres)
 *   npx tsx scripts/db-migrate.ts --seed     # also loads supabase/seed.sql (demo workspace)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const args = new Set(process.argv.slice(2));
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

async function apply(file: string, label: string) {
  const name = path.basename(file);
  const done = await sql`select 1 from public._cc_migrations where name = ${name}`;
  if (done.length) return;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(file, "utf8"));
    await tx`insert into public._cc_migrations (name) values (${name})`;
  });
  console.log(`applied ${label}: ${name}`);
}

async function main() {
  await sql`create table if not exists public._cc_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`revoke all on public._cc_migrations from public`;
  if (args.has("--local")) await apply("db/local/000_supabase_shim.sql", "local shim");
  const dir = "supabase/migrations";
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await apply(path.join(dir, f), "migration");
  }
  if (args.has("--seed")) await apply("supabase/seed.sql", "seed");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await sql.end();
  process.exit(1);
});
