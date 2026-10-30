import "server-only";
import { withUser } from "@/lib/db";
import type { Ctx } from "./workspace";

export type SearchHit = { type: "project" | "client" | "evidence" | "strategy" | "report" | "experiment" | "board"; id: string; title: string; subtitle: string | null; href: string };

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Workspace-scoped search. RLS guarantees only authorized rows are visible. */
export async function searchWorkspace(ctx: Ctx, q: string, types?: SearchHit["type"][]): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  const p = likePattern(query);
  const ws = ctx.workspace.workspaceId;
  const want = (t: SearchHit["type"]) => !types?.length || types.includes(t);
  return withUser(ctx.user.id, async (tx) => {
    const hits: SearchHit[] = [];
    if (want("project")) {
      const rows = await tx`select id, name, category, market from projects where workspace_id = ${ws} and (name ilike ${p} or category ilike ${p} or market ilike ${p}) order by updated_at desc limit 8`;
      rows.forEach((r) => hits.push({ type: "project", id: r.id, title: r.name, subtitle: [r.category, r.market].filter(Boolean).join(" · ") || null, href: `/projects/${r.id}` }));
    }
    if (want("client")) {
      const rows = await tx`select id, name, industry from clients where workspace_id = ${ws} and name ilike ${p} order by name limit 6`;
      rows.forEach((r) => hits.push({ type: "client", id: r.id, title: r.name, subtitle: r.industry, href: `/workspace/clients/${r.id}` }));
    }
    if (want("evidence")) {
      const rows = await tx`select e.id, e.claim, e.evidence_type, e.project_id, p.name as project from evidence_items e join projects p on p.id = e.project_id
        where e.workspace_id = ${ws} and e.claim ilike ${p} order by e.created_at desc limit 8`;
      rows.forEach((r) => hits.push({ type: "evidence", id: r.id, title: r.claim, subtitle: `${String(r.evidence_type).replace(/_/g, " ")} · ${r.project}`, href: `/projects/${r.project_id}/evidence/${r.id}` }));
    }
    if (want("strategy")) {
      const rows = await tx`select d.id, d.name, d.project_id, p.name as project from strategy_directions d join projects p on p.id = d.project_id
        where d.workspace_id = ${ws} and d.status <> 'superseded' and (d.name ilike ${p} or d.content->>'coreIdea' ilike ${p}) order by d.created_at desc limit 6`;
      rows.forEach((r) => hits.push({ type: "strategy", id: r.id, title: r.name, subtitle: `Direction · ${r.project}`, href: `/projects/${r.project_id}/strategy#direction-${r.id}` }));
    }
    if (want("report")) {
      const rows = await tx`select r.id, r.title, r.project_id, p.name as project from reports r join projects p on p.id = r.project_id where r.workspace_id = ${ws} and r.title ilike ${p} order by r.updated_at desc limit 6`;
      rows.forEach((r) => hits.push({ type: "report", id: r.id, title: r.title, subtitle: `Report · ${r.project}`, href: `/projects/${r.project_id}/reports/${r.id}` }));
    }
    if (want("experiment")) {
      const rows = await tx`select x.id, x.name, x.project_id, p.name as project from experiments x join projects p on p.id = x.project_id
        where x.workspace_id = ${ws} and (x.name ilike ${p} or x.hypothesis ilike ${p}) order by x.updated_at desc limit 6`;
      rows.forEach((r) => hits.push({ type: "experiment", id: r.id, title: r.name, subtitle: `Experiment · ${r.project}`, href: `/projects/${r.project_id}/experiments/${r.id}` }));
    }
    if (want("board")) {
      // Boards match on their name or on text written on their cards.
      const rows = await tx`select b.id, b.name, b.project_id, p.name as project from inspiration_boards b join projects p on p.id = b.project_id
        where b.workspace_id = ${ws} and (b.name ilike ${p} or exists (
          select 1 from jsonb_array_elements(b.content->'nodes') x
          where concat_ws(' ', x->'data'->>'text', x->'data'->>'title', x->'data'->>'label', x->'data'->>'name', x->'data'->>'note', x->'data'->>'alt') ilike ${p}))
        order by b.updated_at desc limit 6`;
      rows.forEach((r) => hits.push({ type: "board", id: r.id, title: r.name, subtitle: `Inspiration board · ${r.project}`, href: `/projects/${r.project_id}/boards/${r.id}` }));
    }
    return hits;
  });
}
