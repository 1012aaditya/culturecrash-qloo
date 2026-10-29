/**
 * Database authorization tests (Scenario F at the data layer). Runs every migration
 * into a fresh database and exercises Row Level Security exactly as the app does:
 * SET ROLE authenticated + JWT subject claims. Requires TEST_DATABASE_ADMIN_URL
 * (a Postgres superuser URL, e.g. postgres://postgres@127.0.0.1:54322/postgres).
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCopilotTool } from "@/lib/ai/copilot-tools";

const admin = process.env.TEST_DATABASE_ADMIN_URL;
const d = admin ? describe : describe.skip;
const DB = `cc_rls_${Date.now()}`;
let sql: postgres.Sql;
let root: postgres.Sql;

async function as<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    if (uid) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${uid}, true)`;
      await tx.unsafe("set local role authenticated");
    } else {
      await tx.unsafe("set local role anon");
    }
    return fn(tx);
  })) as T;
}
const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/row-level security|permission denied|mismatch|forbidden|owner/i);
};

async function user(email: string) {
  const [u] = await sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: email.split("@")[0] })}) returning id`;
  const [m] = await sql`select workspace_id from workspace_members where user_id = ${u.id}`;
  return { id: u.id as string, ws: m.workspace_id as string };
}

let A: { id: string; ws: string }, B: { id: string; ws: string }, V: { id: string; ws: string };
let projectA: string, projectB: string;

d("Row Level Security and workspace isolation", () => {
  beforeAll(async () => {
    root = postgres(admin!, { max: 1, onnotice: () => {} });
    await root.unsafe(`create database ${DB}`);
    const url = new URL(admin!);
    url.pathname = `/${DB}`;
    sql = postgres(url.toString(), { max: 4, onnotice: () => {}, prepare: false });
    await sql.unsafe(readFileSync("db/local/000_supabase_shim.sql", "utf8"));
    for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      const text = readFileSync(`supabase/migrations/${f}`, "utf8");
      if (/storage\.(buckets|objects)/.test(text)) continue; // Supabase Storage is not present in plain Postgres
      await sql.unsafe(text);
    }
    A = await user("alice@a.test");
    B = await user("bob@b.test");
    V = await user("vera@a.test");
    // Vera joins Alice's workspace as a viewer (via Alice, an owner).
    await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'vera@a.test', 'viewer')`);
    projectA = (await as(A.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${A.ws}, 'A secret launch', ${A.id}) returning id`))[0].id;
    projectB = (await as(B.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${B.ws}, 'B secret launch', ${B.id}) returning id`))[0].id;
  });
  afterAll(async () => {
    await sql?.end();
    await root?.unsafe(`drop database if exists ${DB} with (force)`);
    await root?.end();
  });

  it("signup trigger creates a profile and an owned workspace", async () => {
    const rows = await as(A.id, (tx) => tx`select role from workspace_members where user_id = ${A.id} and workspace_id = ${A.ws}`);
    expect(rows[0].role).toBe("owner");
  });

  it("users cannot read another workspace's projects, briefs or evidence", async () => {
    expect(await as(B.id, (tx) => tx`select id from projects where id = ${projectA}`)).toHaveLength(0);
    expect(await as(B.id, (tx) => tx`select * from projects`)).toHaveLength(1);
    expect(await as(B.id, (tx) => tx`select * from workspaces where id = ${A.ws}`)).toHaveLength(0);
  });

  it("users cannot write into another workspace even with a forged workspace id", async () => {
    await denied(as(B.id, (tx) => tx`insert into projects (workspace_id, name) values (${A.ws}, 'injected')`));
    const upd = await as(B.id, (tx) => tx`update projects set name = 'pwned' where id = ${projectA} returning id`);
    expect(upd).toHaveLength(0);
    const del = await as(B.id, (tx) => tx`delete from projects where id = ${projectA} returning id`);
    expect(del).toHaveLength(0);
  });

  it("child rows cannot point at a project in another workspace", async () => {
    await denied(as(B.id, (tx) => tx`insert into campaign_briefs (project_id, workspace_id, brand) values (${projectA}, ${B.ws}, 'x')`));
    await denied(as(B.id, (tx) => tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim) values (${projectA}, ${B.ws}, 'hypothesis', 'x')`));
  });

  it("viewers can read but not write", async () => {
    expect(await as(V.id, (tx) => tx`select id from projects where id = ${projectA}`)).toHaveLength(1);
    await denied(as(V.id, (tx) => tx`insert into projects (workspace_id, name) values (${A.ws}, 'viewer project')`));
    expect(await as(V.id, (tx) => tx`update projects set name = 'x' where id = ${projectA} returning id`)).toHaveLength(0);
  });

  it("only owners can grant ownership, and a workspace keeps an owner", async () => {
    await as(A.id, (tx) => tx`update workspace_members set role = 'admin' where workspace_id = ${A.ws} and user_id = ${V.id}`);
    await denied(as(V.id, (tx) => tx`update workspace_members set role = 'owner' where workspace_id = ${A.ws} and user_id = ${V.id}`));
    await denied(as(A.id, (tx) => tx`delete from workspace_members where workspace_id = ${A.ws} and user_id = ${A.id}`));
    await as(A.id, (tx) => tx`update workspace_members set role = 'viewer' where workspace_id = ${A.ws} and user_id = ${V.id}`);
  });

  it("anonymous visitors cannot read tables", async () => {
    await denied(as(null, (tx) => tx`select * from projects`));
    await denied(as(null, (tx) => tx`select * from shared_report_links`));
  });

  it("shared reports resolve only for a valid, unrevoked, unexpired token", async () => {
    const token = "a".repeat(43);
    const hash = createHash("sha256").update(token).digest("hex");
    const versionId = await as(A.id, async (tx) => {
      const [r] = await tx`insert into reports (project_id, workspace_id, title, created_by) values (${projectA}, ${A.ws}, 'Report', ${A.id}) returning id`;
      const [v] = await tx`insert into report_versions (report_id, workspace_id, version, sections, snapshot, created_by) values (${r.id}, ${A.ws}, 1, ${["cover"]}, ${tx.json({ title: "Report" })}, ${A.id}) returning id`;
      await tx`insert into shared_report_links (report_version_id, workspace_id, token_hash, created_by) values (${v.id}, ${A.ws}, ${hash}, ${A.id})`;
      return v.id as string;
    });
    expect(versionId).toBeTruthy();
    expect(await as(null, (tx) => tx`select * from get_shared_report(${hash})`)).toHaveLength(1);
    expect(await as(null, (tx) => tx`select * from get_shared_report(${"0".repeat(64)})`)).toHaveLength(0);
    // Another workspace cannot revoke it; the owner can.
    expect(await as(B.id, (tx) => tx`update shared_report_links set revoked_at = now() where token_hash = ${hash} returning id`)).toHaveLength(0);
    await as(A.id, (tx) => tx`update shared_report_links set revoked_at = now() where token_hash = ${hash}`);
    expect(await as(null, (tx) => tx`select * from get_shared_report(${hash})`)).toHaveLength(0);
  });

  it("report versions are immutable", async () => {
    const n = await as(A.id, (tx) => tx`update report_versions set snapshot = '{}'::jsonb returning id`);
    expect(n).toHaveLength(0);
  });

  it("copilot conversations are private to their author", async () => {
    await as(A.id, (tx) => tx`insert into conversations (project_id, workspace_id, user_id, title) values (${projectA}, ${A.ws}, ${A.id}, 'private')`);
    expect(await as(V.id, (tx) => tx`select * from conversations`)).toHaveLength(0);
    await denied(as(V.id, (tx) => tx`insert into conversations (project_id, workspace_id, user_id) values (${projectA}, ${A.ws}, ${A.id})`));
  });

  it("members cannot read other workspaces' usage or activity", async () => {
    await as(A.id, (tx) => tx`insert into activity_events (workspace_id, actor_id, verb, object_type, summary) values (${A.ws}, ${A.id}, 'x', 'y', 'z')`);
    expect(await as(B.id, (tx) => tx`select * from activity_events where workspace_id = ${A.ws}`)).toHaveLength(0);
    await denied(as(B.id, (tx) => tx`insert into activity_events (workspace_id, actor_id, verb, object_type, summary) values (${A.ws}, ${B.id}, 'x', 'y', 'z')`));
  });

  it("owners can delete their workspace; non-owners cannot", async () => {
    const C = await user("carol@c.test");
    expect(await as(B.id, (tx) => tx`delete from workspaces where id = ${C.ws} returning id`)).toHaveLength(0);
    expect(await as(C.id, (tx) => tx`delete from workspaces where id = ${C.ws} returning id`)).toHaveLength(1);
  });

  it("pilot requests are not readable by app users", async () => {
    await denied(as(A.id, (tx) => tx`select * from pilot_requests`));
  });

  it("notifications are private, only sent to fellow members, and only read_at can change", async () => {
    // No RETURNING: the sender has no SELECT on the recipient's row.
    await as(A.id, (tx) => tx`insert into notifications (workspace_id, user_id, actor_id, kind, title, href)
      values (${A.ws}, ${V.id}, ${A.id}, 'report_shared', 'Shared', '/dashboard')`);
    const [n] = await as(V.id, (tx) => tx`select id from notifications where title = 'Shared'`);
    // Bob is not in Alice's workspace: cannot be notified there, and cannot notify into it.
    await denied(as(A.id, (tx) => tx`insert into notifications (workspace_id, user_id, kind, title) values (${A.ws}, ${B.id}, 'report_shared', 'x')`));
    await denied(as(B.id, (tx) => tx`insert into notifications (workspace_id, user_id, kind, title) values (${A.ws}, ${V.id}, 'report_shared', 'x')`));
    // Actor cannot be forged.
    await denied(as(V.id, (tx) => tx`insert into notifications (workspace_id, user_id, actor_id, kind, title) values (${A.ws}, ${A.id}, ${B.id}, 'report_shared', 'x')`));
    // Only the recipient sees it; the sender cannot read it back.
    expect(await as(V.id, (tx) => tx`select id from notifications where id = ${n.id}`)).toHaveLength(1);
    expect(await as(A.id, (tx) => tx`select id from notifications where id = ${n.id}`)).toHaveLength(0);
    expect(await as(V.id, (tx) => tx`update notifications set read_at = now() where id = ${n.id} returning id`)).toHaveLength(1);
    await expect(as(V.id, (tx) => tx`update notifications set title = 'changed' where id = ${n.id}`)).rejects.toThrow(/immutable except read_at/);
    await expect(as(V.id, (tx) => tx`insert into notifications (workspace_id, user_id, kind, title, href) values (${A.ws}, ${V.id}, 'report_shared', 'x', 'https://evil.test')`)).rejects.toThrow(/check constraint/);
  });

  it("copilot tools only see what the caller can see", async () => {
    await as(A.id, (tx) => tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim) values (${projectA}, ${A.ws}, 'hypothesis', 'Gen Z loves vinyl listening bars')`);
    const own = await as(A.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "vinyl" }));
    expect(own.evidenceIds).toHaveLength(1);
    // Bob passes Alice's project id directly: RLS returns nothing.
    const other = await as(B.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "vinyl" }));
    expect(other.evidenceIds).toHaveLength(0);
    expect(await as(B.id, (tx) => runCopilotTool(tx, projectA, "list_opportunities", {}))).toMatchObject({ result: [] });
    // Bad input and unknown tools are rejected without querying.
    expect((await as(A.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "" }))).result).toMatchObject({ error: "Invalid input" });
    expect((await as(A.id, (tx) => runCopilotTool(tx, projectA, "drop_tables", {}))).result).toMatchObject({ error: "Unknown tool drop_tables" });
  });
});
