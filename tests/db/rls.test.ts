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
import { buildSnapshot } from "@/lib/reports/snapshot";
import { closeRun, sweepStaleRuns, sweepStaleTasks } from "@/lib/research/lifecycle";
import { PITCH_PACK_SECTIONS } from "@/lib/reports/types";

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
let projectA: string;

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
    // Vera joins Alice's workspace as a viewer: Alice (an owner) invites, Vera accepts.
    await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'vera@a.test', 'viewer')`);
    const [inv] = await as(V.id, (tx) => tx`select id from my_pending_invitations()`);
    await as(V.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`);
    projectA = (await as(A.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${A.ws}, 'A secret launch', ${A.id}) returning id`))[0].id;
    // Bob has a project of his own, so isolation checks below compare against real data.
    await as(B.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${B.ws}, 'B secret launch', ${B.id})`);
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
    expect(own.result).toHaveLength(1);
    // A hypothesis is readable context but never citable as evidence.
    expect(own.evidenceIds).toHaveLength(0);
    await as(A.id, (tx) => tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim) values (${projectA}, ${A.ws}, 'external_source', 'Vinyl listening bars opened in three cities')`);
    expect((await as(A.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "vinyl" }))).evidenceIds).toHaveLength(1);
    // Bob passes Alice's project id directly: RLS returns nothing.
    const other = await as(B.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "vinyl" }));
    expect(other.result).toHaveLength(0);
    expect(await as(B.id, (tx) => runCopilotTool(tx, projectA, "list_opportunities", {}))).toMatchObject({ result: [] });
    // Bad input and unknown tools are rejected without querying.
    expect((await as(A.id, (tx) => runCopilotTool(tx, projectA, "search_evidence", { query: "" }))).result).toMatchObject({ error: "Invalid input" });
    expect((await as(A.id, (tx) => runCopilotTool(tx, projectA, "drop_tables", {}))).result).toMatchObject({ error: "Unknown tool drop_tables" });
  });

  it("presence is visible to workspace members only and can't be forged", async () => {
    await as(A.id, (tx) => tx`insert into presence (user_id, project_id, workspace_id, page, field) values (${A.id}, ${projectA}, ${A.ws}, 'brief', 'audience')`);
    expect(await as(V.id, (tx) => tx`select field from presence where project_id = ${projectA}`)).toHaveLength(1);
    expect(await as(B.id, (tx) => tx`select field from presence where project_id = ${projectA}`)).toHaveLength(0);
    // Bob can't announce himself in Alice's project, nor write a row for someone else.
    await denied(as(B.id, (tx) => tx`insert into presence (user_id, project_id, workspace_id, page) values (${B.id}, ${projectA}, ${A.ws}, 'brief')`));
    await denied(as(V.id, (tx) => tx`insert into presence (user_id, project_id, workspace_id, page) values (${A.id}, ${projectA}, ${A.ws}, 'brief')`));
    // A project from another workspace can't be paired with your own workspace id.
    await denied(as(B.id, (tx) => tx`insert into presence (user_id, project_id, workspace_id, page) values (${B.id}, ${projectA}, ${B.ws}, 'brief')`));
  });

  it("research documents, brand-document passages and the provider cache are workspace-isolated", async () => {
    const [run] = await as(A.id, (tx) => tx`insert into research_runs (project_id, workspace_id, mode, provider, question, idempotency_key, depth) values (${projectA}, ${A.ws}, 'live', 'multi-source', 'q', ${"k-" + Date.now()}, 'quick') returning id`);
    await as(A.id, (tx) => tx`insert into research_documents (run_id, project_id, workspace_id, provider, source_type, canonical_url, title, excerpt) values (${run.id}, ${projectA}, ${A.ws}, 'brave', 'web_page', 'https://a.test/x', 'A doc', 'confidential-ish excerpt')`);
    const [doc] = await as(A.id, (tx) => tx`insert into brief_documents (project_id, workspace_id, file_name, mime_type, size_bytes, extracted_text, extraction_status) values (${projectA}, ${A.ws}, 'brand.txt', 'text/plain', 10, 'secret positioning', 'extracted') returning id`);
    await as(A.id, (tx) => tx`insert into brand_document_chunks (document_id, project_id, workspace_id, idx, content) values (${doc.id}, ${projectA}, ${A.ws}, 0, 'Lumen positioning: calm rituals for Gen Z')`);
    await as(A.id, (tx) => tx`insert into provider_cache (workspace_id, provider, cache_key, response, expires_at) values (${A.ws}, 'brave', 'k1', '[]'::jsonb, now() + interval '1 hour')`);
    // Bob sees none of it — including via full-text search on Alice's project id.
    expect(await as(B.id, (tx) => tx`select id from research_documents where run_id = ${run.id}`)).toHaveLength(0);
    expect(await as(B.id, (tx) => tx`select id from brand_document_chunks where project_id = ${projectA} and tsv @@ websearch_to_tsquery('english', 'positioning')`)).toHaveLength(0);
    expect(await as(B.id, (tx) => tx`select cache_key from provider_cache where workspace_id = ${A.ws}`)).toHaveLength(0);
    expect(await as(A.id, (tx) => tx`select id from brand_document_chunks where project_id = ${projectA} and tsv @@ websearch_to_tsquery('english', 'positioning')`)).toHaveLength(1);
    // Bob can't write into Alice's workspace, nor pair her project with his workspace.
    await denied(as(B.id, (tx) => tx`insert into provider_cache (workspace_id, provider, cache_key, response, expires_at) values (${A.ws}, 'brave', 'poison', '[]'::jsonb, now() + interval '1 hour')`));
    await denied(as(B.id, (tx) => tx`insert into research_documents (run_id, project_id, workspace_id, provider, source_type, title) values (${run.id}, ${projectA}, ${B.ws}, 'brave', 'web_page', 'x')`));
    // Viewers can read but not write research data.
    expect(await as(V.id, (tx) => tx`select id from research_documents where run_id = ${run.id}`)).toHaveLength(1);
    await denied(as(V.id, (tx) => tx`insert into provider_cache (workspace_id, provider, cache_key, response, expires_at) values (${A.ws}, 'brave', 'v', '[]'::jsonb, now() + interval '1 hour')`));
  });

  it("research spend and per-user counts only answer for workspaces you belong to", async () => {
    const [run] = await as(A.id, (tx) => tx`select id from research_runs where workspace_id = ${A.ws} limit 1`);
    await as(A.id, (tx) => tx`insert into research_sources (run_id, workspace_id, provider, endpoint, status, cost_usd_estimated) values (${run.id}, ${A.ws}, 'brave', 'search', 'ok', 0.005)`);
    expect(Number((await as(A.id, (tx) => tx`select research_spend_this_month(${A.ws}) as s`))[0].s)).toBeCloseTo(0.005);
    expect(Number((await as(B.id, (tx) => tx`select research_spend_this_month(${A.ws}) as s`))[0].s)).toBe(0);
    expect((await as(B.id, (tx) => tx`select research_runs_today_by_user(${A.ws}, ${A.id}) as n`))[0].n).toBe(0);
  });

  it("profile email can't be changed by its owner, so invitations can't be hijacked", async () => {
    // Bob tries to take over an invitation addressed to someone else's email.
    await denied(as(B.id, (tx) => tx`update profiles set email = 'newhire@a.test' where id = ${B.id}`));
    expect(await as(B.id, (tx) => tx`update profiles set full_name = 'Bob B' where id = ${B.id} returning id`)).toHaveLength(1);
    await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'newhire@a.test', 'member')`);
    expect(await as(B.id, (tx) => tx`select id from my_pending_invitations()`)).toHaveLength(0);
    expect(await as(B.id, (tx) => tx`select * from workspace_members where workspace_id = ${A.ws} and user_id = ${B.id}`)).toHaveLength(0);
  });

  it("invitations add nobody until a confirmed invitee accepts", async () => {
    const D = await user("dan@d.test");
    const [{ invite_member: outcome }] = await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'dan@d.test', 'member')`);
    expect(outcome).toBe("invited"); // the same answer whether or not the address has an account
    expect(await as(D.id, (tx) => tx`select * from workspaces where id = ${A.ws}`)).toHaveLength(0);
    const [inv] = await as(D.id, (tx) => tx`select id, workspace_name from my_pending_invitations()`);
    expect(inv.workspace_name).toBeTruthy();
    // Nobody else can answer it.
    await expect(as(B.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`)).rejects.toThrow(/invitation not found/);
    // An unconfirmed account sees nothing and can't accept.
    await sql`update auth.users set email_confirmed_at = null where id = ${D.id}`;
    expect(await as(D.id, (tx) => tx`select id from my_pending_invitations()`)).toHaveLength(0);
    await expect(as(D.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`)).rejects.toThrow(/invitation not found/);
    await sql`update auth.users set email_confirmed_at = now() where id = ${D.id}`;
    await as(D.id, (tx) => tx`select respond_to_invitation(${inv.id}, false)`);
    expect(await as(D.id, (tx) => tx`select id from my_pending_invitations()`)).toHaveLength(0);
    expect(await as(D.id, (tx) => tx`select * from workspaces where id = ${A.ws}`)).toHaveLength(0);
  });

  it("only owners change limits and retention; nobody edits plan or demo flags directly", async () => {
    await as(A.id, (tx) => tx`update workspace_members set role = 'admin' where workspace_id = ${A.ws} and user_id = ${V.id}`);
    await denied(as(V.id, (tx) => tx`update workspaces set research_runs_daily_limit = 1000 where id = ${A.ws}`));
    await denied(as(A.id, (tx) => tx`update workspaces set plan = 'agency', is_demo = true where id = ${A.ws}`));
    await denied(as(V.id, (tx) => tx`select set_research_limits(${A.ws}, 9999, 200)`));
    await denied(as(V.id, (tx) => tx`select set_data_retention(${A.ws}, 30)`));
    await as(A.id, (tx) => tx`select set_research_limits(${A.ws}, 40, 20)`);
    await as(A.id, (tx) => tx`select set_data_retention(${A.ws}, 90)`);
    const [w] = await as(A.id, (tx) => tx`select research_budget_usd_monthly, research_runs_per_user_daily, data_retention_days from workspaces where id = ${A.ws}`);
    expect([Number(w.research_budget_usd_monthly), w.research_runs_per_user_daily, w.data_retention_days]).toEqual([40, 20, 90]);
    expect(await as(V.id, (tx) => tx`update workspaces set name = 'Renamed by admin' where id = ${A.ws} returning id`)).toHaveLength(1);
    await as(A.id, (tx) => tx`update workspace_members set role = 'viewer' where workspace_id = ${A.ws} and user_id = ${V.id}`);
  });

  it("a user can own at most three workspaces", async () => {
    const E = await user("erin@e.test");
    await as(E.id, (tx) => tx`select create_workspace('Second')`);
    await as(E.id, (tx) => tx`select create_workspace('Third')`);
    await expect(as(E.id, (tx) => tx`select create_workspace('Fourth')`)).rejects.toThrow(/at most three/);
  });

  it("notifications can't be planted for a teammate or point off-site", async () => {
    // Vera (viewer) can't notify Alice, even as herself.
    await denied(as(V.id, (tx) => tx`insert into notifications (workspace_id, user_id, actor_id, kind, title) values (${A.ws}, ${A.id}, ${V.id}, 'report_shared', 'Verify your account')`));
    await expect(as(V.id, (tx) => tx`insert into notifications (workspace_id, user_id, kind, title, href) values (${A.ws}, ${V.id}, 'report_shared', 'x', ${"/" + String.fromCharCode(92) + "evil.test"})`)).rejects.toThrow(/check constraint/);
  });

  it("the Data API pre-request hook refuses every call", async () => {
    await expect(as(A.id, (tx) => tx`select data_api_disabled()`)).rejects.toThrow(/Data API is disabled/);
  });

  it("report snapshots leave out rejected evidence and hypotheses, and always include what they cite", async () => {
    const ids = await as(A.id, async (tx) => {
      await tx`insert into campaign_briefs (project_id, workspace_id, brand) values (${projectA}, ${A.ws}, 'Lumen') on conflict do nothing`;
      const ins = (type: string, claim: string, review: string) =>
        tx`insert into evidence_items (project_id, workspace_id, evidence_type, claim, review_status) values (${projectA}, ${A.ws}, ${type}::evidence_type, ${claim}, ${review}::review_status) returning id`;
      const [rejected] = await ins("external_source", "A source a strategist marked wrong", "rejected");
      const [good] = await ins("external_source", "Vogue India: Gen Z in Mumbai follow K-beauty creators", "approved");
      await tx`insert into opportunities (project_id, workspace_id, title, description, evidence_ids, claims, generator)
        values (${projectA}, ${A.ws}, 'K-beauty creators', 'x', ${[rejected.id, good.id]},
          ${tx.json([{ statement: "Gen Z in Mumbai follow K-beauty creators", evidenceIds: [good.id], support: "verified" }] as never)}, 'template')`;
      return { rejected: rejected.id as string, good: good.id as string };
    });
    const snap = await as(A.id, (tx) => buildSnapshot(tx, projectA, ["evidence", "opportunities"], "Test report"));
    const evIds = snap.evidence.map((e) => e.id);
    expect(evIds).toContain(ids.good);
    expect(evIds).not.toContain(ids.rejected);
    expect(snap.evidence.some((e) => e.type === "hypothesis" || e.type === "ai_interpretation")).toBe(false);
    expect(snap.opportunities[0].claims?.[0].support).toBe("verified");
    expect(snap.limitations.join(" ")).not.toMatch(/No public-web research provider was configured/);
  });

  it("dead research runs are closed (keeping what they found), live ones are left alone", async () => {
    const P = (await as(A.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${A.ws}, 'Lifecycle', ${A.id}) returning id`))[0].id as string;
    const mk = (key: string, extra: string) => as(A.id, async (tx) => {
      // Older runs on this project are finished first: only one may be active at a time.
      await tx`update research_runs set status = 'completed' where project_id = ${P} and status in ('queued', 'running')`;
      const [r] = await tx`insert into research_runs (project_id, workspace_id, mode, provider, question, idempotency_key, depth, status) values (${P}, ${A.ws}, 'live', 'multi-source', 'q', ${key}, 'quick', 'running') returning id`;
      await tx.unsafe(`update research_runs set ${extra} where id = '${r.id}'`);
      await tx`insert into background_tasks (workspace_id, project_id, kind, label, status, ref_id) values (${A.ws}, ${P}, 'research_run', 'r', 'running', ${r.id})`;
      return r.id as string;
    });
    // Heartbeat 5 minutes old, with a stored document: closed as partially completed.
    const dead = await mk(`dead-${Date.now()}`, "started_at = now() - interval '5 minutes', started_by_heartbeat = now() - interval '5 minutes'");
    await as(A.id, (tx) => tx`insert into research_documents (run_id, project_id, workspace_id, provider, source_type, title) values (${dead}, ${P}, ${A.ws}, 'brave', 'web_page', 'kept')`);
    expect(await as(A.id, (tx) => sweepStaleRuns(tx, P))).toBe(1);
    const [d] = await as(A.id, (tx) => tx`select status, stop_reason from research_runs where id = ${dead}`);
    expect([d.status, d.stop_reason]).toEqual(["partially_completed", "stale"]);
    expect((await as(A.id, (tx) => tx`select status from background_tasks where ref_id = ${dead}`))[0].status).toBe("completed");
    // Closing is one-shot: a late worker or a second sweep can't reopen or re-close it.
    expect(await as(A.id, (tx) => closeRun(tx, dead, "time_limit"))).toBe(false);
    // A fresh heartbeat means the worker is alive.
    const live = await mk(`live-${Date.now()}`, "started_at = now() - interval '1 minute', started_by_heartbeat = now()");
    expect(await as(A.id, (tx) => sweepStaleRuns(tx, P))).toBe(0);
    // Running longer than the function limit is dead whatever its heartbeat says; nothing collected = failed.
    await as(A.id, (tx) => tx`update research_runs set started_at = now() - interval '7 minutes' where id = ${live}`);
    expect(await as(A.id, (tx) => sweepStaleRuns(tx, P))).toBe(1);
    expect((await as(A.id, (tx) => tx`select status from research_runs where id = ${live}`))[0].status).toBe("failed");
  });

  it("a project can have only one active research run", async () => {
    const P = (await as(A.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${A.ws}, 'One at a time', ${A.id}) returning id`))[0].id as string;
    const insert = (key: string) => as(A.id, (tx) => tx`insert into research_runs (project_id, workspace_id, mode, provider, question, idempotency_key, depth, status) values (${P}, ${A.ws}, 'live', 'multi-source', 'q', ${key}, 'quick', 'queued') returning id`);
    const [first] = await insert(`a-${Date.now()}`);
    await expect(insert(`b-${Date.now()}`)).rejects.toThrow(/research_runs_one_active_per_project|duplicate key/);
    // Cancelling a queued run closes it at once, which frees the project.
    expect(await as(A.id, (tx) => closeRun(tx, first.id, "cancelled"))).toBe(true);
    expect((await as(A.id, (tx) => tx`select status from research_runs where id = ${first.id}`))[0].status).toBe("cancelled");
    await insert(`c-${Date.now()}`);
  });

  it("generation tasks left running by a killed request are closed", async () => {
    const [t] = await as(A.id, (tx) => tx`insert into background_tasks (workspace_id, project_id, kind, label, status, started_at) values (${A.ws}, ${projectA}, 'strategy_generation', 's', 'running', now() - interval '10 minutes') returning id`);
    const [fresh] = await as(A.id, (tx) => tx`insert into background_tasks (workspace_id, project_id, kind, label, status, started_at) values (${A.ws}, ${projectA}, 'creative_brief', 'c', 'running', now()) returning id`);
    expect(await as(A.id, (tx) => sweepStaleTasks(tx, projectA))).toBe(1);
    expect((await as(A.id, (tx) => tx`select status from background_tasks where id = ${t.id}`))[0].status).toBe("failed");
    expect((await as(A.id, (tx) => tx`select status from background_tasks where id = ${fresh.id}`))[0].status).toBe("running");
  });

  it("Devil's Advocate critiques are workspace-private, and rate results can't exceed their exposures", async () => {
    const [sv] = await as(A.id, (tx) => tx`insert into strategy_versions (project_id, workspace_id, version, generator, created_by) values (${projectA}, ${A.ws}, 99, 'template', ${A.id}) returning id`);
    await as(A.id, (tx) => tx`insert into strategy_critiques (workspace_id, project_id, version_id, critique, generator, created_by) values (${A.ws}, ${projectA}, ${sv.id}, '{}'::jsonb, 'llm:test', ${A.id})`);
    expect(await as(V.id, (tx) => tx`select id from strategy_critiques where version_id = ${sv.id}`)).toHaveLength(1);
    expect(await as(B.id, (tx) => tx`select id from strategy_critiques where version_id = ${sv.id}`)).toHaveLength(0);
    // Viewers can't save one, nobody can save one as someone else, and nobody can write into another workspace.
    await denied(as(V.id, (tx) => tx`insert into strategy_critiques (workspace_id, project_id, version_id, critique, generator, created_by) values (${A.ws}, ${projectA}, ${sv.id}, '{}'::jsonb, 'x', ${V.id})`));
    await denied(as(B.id, (tx) => tx`insert into strategy_critiques (workspace_id, project_id, version_id, critique, generator, created_by) values (${A.ws}, ${projectA}, ${sv.id}, '{}'::jsonb, 'x', ${B.id})`));

    const [x] = await as(A.id, (tx) => tx`insert into experiments (project_id, workspace_id, name, hypothesis, primary_metric) values (${projectA}, ${A.ws}, 'Ritual test', 'Ritual framing converts better than efficacy framing', 'conversion') returning id`);
    await as(A.id, (tx) => tx`insert into experiment_results (experiment_id, workspace_id, metric, value, sample_size, successes) values (${x.id}, ${A.ws}, 'conversion', 0.1, 1000, 100)`);
    await expect(as(A.id, (tx) => tx`insert into experiment_results (experiment_id, workspace_id, metric, value, sample_size, successes) values (${x.id}, ${A.ws}, 'conversion', 1.2, 100, 120)`)).rejects.toThrow(/check constraint/);
    await expect(as(A.id, (tx) => tx`insert into experiment_results (experiment_id, workspace_id, metric, value, successes) values (${x.id}, ${A.ws}, 'conversion', 1, 5)`)).rejects.toThrow(/check constraint/);
  });

  it("a pitch pack carries the latest Devil's Advocate objections for the strategy it presents", async () => {
    const P = (await as(A.id, (tx) => tx`insert into projects (workspace_id, name, owner_id) values (${A.ws}, 'Pitch', ${A.id}) returning id`))[0].id as string;
    await as(A.id, async (tx) => {
      await tx`insert into campaign_briefs (project_id, workspace_id, brand) values (${P}, ${A.ws}, 'Lumen')`;
      const [sv] = await tx`insert into strategy_versions (project_id, workspace_id, version, generator, created_by) values (${P}, ${A.ws}, 1, 'llm:test', ${A.id}) returning id`;
      await tx`insert into strategy_directions (version_id, project_id, workspace_id, slot, name, content, created_by) values (${sv.id}, ${P}, ${A.ws}, 1, 'Ritual', ${tx.json({ name: "Ritual", coreIdea: "x", positioningStatement: "y" } as never)}, ${A.id})`;
      const critique = { overallVerdict: "vulnerable", executiveSummary: "Too close to Competitor A.", critiques: [{ directionSlot: 1, directionName: "Ritual", fatalFlaw: "Competitor A already says this.", weakestEvidence: "One forum thread.", nearestCompetitor: "Competitor A", culturalRisk: "c", competitorCounter: "d", toughestClientQuestion: "Why us?", suggestedDefense: "Own the ritual moment, not the claim." }] };
      await tx`insert into strategy_critiques (workspace_id, project_id, version_id, critique, generator, created_by) values (${A.ws}, ${P}, ${sv.id}, ${tx.json(critique as never)}, 'llm:test', ${A.id})`;
    });
    const snap = await as(A.id, (tx) => buildSnapshot(tx, P, PITCH_PACK_SECTIONS, "Pitch pack"));
    expect(snap.sections).toContain("objections");
    expect(snap.objections?.verdict).toBe("vulnerable");
    expect(snap.objections?.items[0]).toMatchObject({ direction: "Ritual", competitor: "Competitor A", question: "Why us?", answer: "Own the ritual moment, not the claim." });
  });

  it("uploaders (and admins) can delete brief documents; other members and viewers can't", async () => {
    const M = await user("mia@a.test");
    await as(A.id, (tx) => tx`select invite_member(${A.ws}, 'mia@a.test', 'member')`);
    const [inv] = await as(M.id, (tx) => tx`select id from my_pending_invitations()`);
    await as(M.id, (tx) => tx`select respond_to_invitation(${inv.id}, true)`);
    const add = (uid: string, name: string) => as(uid, (tx) => tx`insert into brief_documents (project_id, workspace_id, file_name, mime_type, size_bytes, extraction_status, created_by)
      values (${projectA}, ${A.ws}, ${name}, 'text/plain', 10, 'extracted', ${uid}) returning id`);
    const [mine] = await add(M.id, "mia.txt");
    const [alices] = await add(A.id, "alice.txt");
    expect(await as(M.id, (tx) => tx`delete from brief_documents where id = ${alices.id} returning id`)).toHaveLength(0);
    expect(await as(V.id, (tx) => tx`delete from brief_documents where id = ${mine.id} returning id`)).toHaveLength(0);
    expect(await as(M.id, (tx) => tx`delete from brief_documents where id = ${mine.id} returning id`)).toHaveLength(1);
    expect(await as(A.id, (tx) => tx`delete from brief_documents where id = ${alices.id} returning id`)).toHaveLength(1);
  });

  it("digest delivery records are server-only", async () => {
    await denied(as(A.id, (tx) => tx`select * from digest_deliveries`));
    await denied(as(A.id, (tx) => tx`insert into digest_deliveries (user_id, week_start) values (${A.id}, current_date)`));
  });
});
