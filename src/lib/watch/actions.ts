"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/data/activity";
import { friendly, invalid, type Result } from "@/lib/data/action-utils";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { env } from "@/lib/env";
import { assertCan } from "@/lib/permissions";
import { withUser, type Tx } from "@/lib/db";
import { processWatchJob } from "./collect";
import { backfillKeys } from "./plan";
import { runHistoryWorkers } from "./schedule";

const name = z.string().trim().min(1, "Enter a name").max(120);
const watchSchema = z.object({
  company: name,
  competitors: z.array(z.string().trim().max(120)).max(2, "Up to two competitors for now").transform((l) => l.filter(Boolean)),
  keywords: z.array(z.string().trim().max(60)).max(10, "Up to 10 keywords").transform((l) => [...new Set(l.filter(Boolean))]),
  market: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
  frequency: z.enum(["daily", "weekly"]),
});

const path = (clientId: string) => `/workspace/clients/${clientId}/watch`;

/**
 * Creates or updates the client's watch. Targets are matched by name, so renaming nothing keeps every
 * collected story linked to its company. Whoever saves the watch becomes the person it runs as.
 */
export async function saveWatchAction(clientId: string, input: z.input<typeof watchSchema>): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Invalid client." };
  const parsed = watchSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const names = [d.company, ...d.competitors].map((n) => n.toLowerCase());
  if (new Set(names).size !== names.length) return { ok: false, error: "The company and competitors must all be different." };
  const ctx = await getCtx();
  let backfill = false;
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const ws = ctx.workspace.workspaceId;
    await withUser(ctx.user.id, async (tx) => {
      const [client] = await tx`select id, name from clients where id = ${clientId} and workspace_id = ${ws}`;
      if (!client) throw Object.assign(new Error("not found"), { code: "42501" });
      const [w] = await tx`insert into watches (workspace_id, client_id, market, keywords, frequency, created_by)
        values (${ws}, ${clientId}, ${d.market}, ${d.keywords}, ${d.frequency}, ${ctx.user.id})
        on conflict (client_id) do update set market = excluded.market, keywords = excluded.keywords, frequency = excluded.frequency,
          created_by = excluded.created_by, updated_at = now()
        returning id, (xmax = 0) as created`;
      const desired = [{ role: "company" as const, name: d.company }, ...d.competitors.map((n) => ({ role: "competitor" as const, name: n }))];
      const existing = await tx`select id, role, name from watch_targets where watch_id = ${w.id}`;
      const keep = new Set(desired.map((t) => t.name.toLowerCase()));
      // Removed targets first (frees competitor slots), then renamed roles, then new names.
      for (const t of existing) if (!keep.has(String(t.name).toLowerCase())) await tx`delete from watch_targets where id = ${t.id}`;
      await tx`update watch_targets set role = 'competitor' where watch_id = ${w.id} and role = 'company' and lower(name) <> ${d.company.toLowerCase()}`;
      for (const t of desired) {
        const match = existing.find((x) => String(x.name).toLowerCase() === t.name.toLowerCase());
        if (match) await tx`update watch_targets set role = ${t.role}, name = ${t.name} where id = ${match.id}`;
        else await tx`insert into watch_targets (watch_id, workspace_id, role, name) values (${w.id}, ${ws}, ${t.role}, ${t.name})`;
      }
      // Fill in the last 30 days straight away, so the dashboard has history from the start.
      if (w.created && (await queueHistory(tx, w.id, ws))) backfill = true;
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, verb: w.created ? "created" : "updated", objectType: "watch", objectId: w.id,
        summary: `${w.created ? "started watching" : "updated the watch on"} ${client.name}${d.competitors.length ? ` and ${d.competitors.join(", ")}` : ""}` });
    });
  } catch (e) {
    return friendly(e);
  }
  if (backfill) after(() => runHistoryWorkers());
  revalidatePath(path(clientId));
  return { ok: true, message: backfill ? "Watch started. The last 30 days of news are loading now." : "Watch saved." };
}

export async function setWatchStatusAction(clientId: string, status: "active" | "paused"): Promise<Result> {
  if (!isUuid(clientId) || !["active", "paused"].includes(status)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const rows = await withUser(ctx.user.id, (tx) => tx`update watches set status = ${status}, updated_at = now(),
      next_run_at = case when ${status}::text = 'active' and next_run_at < now() then now() else next_run_at end
      where client_id = ${clientId} and workspace_id = ${ctx.workspace.workspaceId} returning id`);
    if (!rows.length) return { ok: false, error: "No watch is set up for this client." };
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(path(clientId));
  return { ok: true };
}

/**
 * Runs a check now through the same job path as the daily cron. One manual check per watch per hour
 * (the run key enforces it), so it can't be used to burn the budget.
 */
export async function checkNowAction(clientId: string): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const hour = new Date().toISOString().slice(0, 13);
    const job = await withUser(ctx.user.id, async (tx) => {
      const [w] = await tx`select id, workspace_id, status from watches where client_id = ${clientId} and workspace_id = ${ctx.workspace.workspaceId}`;
      if (!w) return { error: "No watch is set up for this client." };
      if (w.status !== "active") return { error: "Resume the watch before running a check." };
      const [j] = await tx`insert into watch_jobs (watch_id, workspace_id, run_key, status, attempts, started_at, heartbeat_at)
        values (${w.id}, ${w.workspace_id}, ${`manual:${hour}`}, 'running', 1, now(), now())
        on conflict (watch_id, run_key) do nothing returning id, watch_id, workspace_id`;
      return j ? { job: j } : { error: "A check already ran this hour. The next one is available on the hour." };
    });
    if ("error" in job) return { ok: false, error: job.error as string };
    after(() => processWatchJob({ id: job.job.id, watch_id: job.job.watch_id, workspace_id: job.job.workspace_id }).then(() => undefined));
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(path(clientId));
  return { ok: true, message: "Checking now. New stories appear here in about a minute." };
}

const sourceSchema = z.array(z.object({
  target: z.string().trim().min(1).max(120),
  url: z.string().trim().max(2000).url("Enter a full web address, starting with https://")
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) addresses can be watched")
    .refine((u) => { const h = new URL(u).hostname; return !/^(localhost|.*\.(local|localhost|internal))$/i.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h); }, "Use the site's public web address"),
})).max(15);

/** RSS/Atom addresses are watched as feeds; everything else as a page. */
const kindOf = (url: string) => (/(?:\/feed\/?|\/rss\/?|\.rss|\.xml|atom)(?:$|[?#])/i.test(url) ? "feed" : "page");

/**
 * Replaces the websites and feeds a watch follows. Rows are matched by address, so a page that stays
 * keeps its history and status; a removed page takes its snapshots with it.
 */
export async function saveWatchSourcesAction(clientId: string, input: { target: string; url: string }[]): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Invalid client." };
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the addresses." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const ws = ctx.workspace.workspaceId;
    await withUser(ctx.user.id, async (tx) => {
      const [w] = await tx`select id from watches where client_id = ${clientId} and workspace_id = ${ws}`;
      if (!w) throw Object.assign(new Error("Set up the watch first."), { code: "54000" });
      const targets = await tx`select id, name from watch_targets where watch_id = ${w.id}`;
      const desired = parsed.data.map((s) => ({ ...s, url: new URL(s.url).toString(), targetId: targets.find((t) => String(t.name).toLowerCase() === s.target.toLowerCase())?.id as string | undefined }));
      if (desired.some((d) => !d.targetId)) throw Object.assign(new Error("Pick one of the watched companies for each address."), { code: "54000" });
      const keep = desired.map((d) => d.url);
      await tx`delete from watch_pages where watch_id = ${w.id} and not (url = any(${keep}))`;
      for (const d of desired) {
        await tx`insert into watch_pages (workspace_id, watch_id, watch_target_id, url, kind)
          values (${ws}, ${w.id}, ${d.targetId!}, ${d.url}, ${kindOf(d.url)})
          on conflict (watch_id, url) do update set watch_target_id = excluded.watch_target_id`;
      }
    });
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(path(clientId));
  return { ok: true, message: "Websites saved. They're checked with the next daily run." };
}

/** Queues the watch's history chunks that don't exist yet; true when any were added. */
async function queueHistory(tx: Tx, watchId: string, ws: string): Promise<boolean> {
  const keys = backfillKeys(env().WATCH_BACKFILL_DAYS);
  if (!keys.length) return false;
  const rows = await tx`insert into watch_jobs (watch_id, workspace_id, run_key)
    select ${watchId}, ${ws}, k from unnest(${keys}::text[]) as k
    on conflict (watch_id, run_key) do nothing returning id`;
  return rows.length > 0;
}

/** Fills in the last 30 days for a watch that doesn't have its history yet (once per watch). */
export async function loadHistoryAction(clientId: string): Promise<Result> {
  if (!isUuid(clientId)) return { ok: false, error: "Invalid request." };
  if (env().WATCH_BACKFILL_DAYS === 0) return { ok: false, error: "History loading is turned off on this server." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "client.edit");
    const start = await withUser(ctx.user.id, async (tx) => {
      const [w] = await tx`select id, workspace_id from watches where client_id = ${clientId} and workspace_id = ${ctx.workspace.workspaceId}`;
      if (!w) return false;
      const added = await queueHistory(tx, w.id, w.workspace_id);
      // Chunks whose worker stopped responding (no heartbeat for 5 minutes) are started again.
      await tx`update watch_jobs set status = 'queued', attempts = 0, started_at = null
        where watch_id = ${w.id} and run_key like 'backfill:%' and status = 'running' and coalesce(heartbeat_at, started_at) < now() - interval '5 minutes'`;
      // Chunks the daily run queued but hasn't reached yet are started now too.
      const [{ waiting }] = await tx`select count(*)::int as waiting from watch_jobs where watch_id = ${w.id} and run_key like 'backfill:%' and status = 'queued'`;
      return added || waiting > 0; // includes stalled chunks just put back in the queue
    });
    if (!start) return { ok: false, error: "History is already loaded or loading for this watch." };
    after(() => runHistoryWorkers());
  } catch (e) {
    return friendly(e);
  }
  revalidatePath(path(clientId));
  return { ok: true, message: "Loading the last 30 days. This takes about two minutes." };
}
