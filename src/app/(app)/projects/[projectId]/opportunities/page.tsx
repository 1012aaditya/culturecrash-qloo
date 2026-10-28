import type { Metadata } from "next";
import { themeForCategory } from "@/components/art/plate";
import { GenerateButton } from "@/components/strategy/generate-button";
import { OpportunityBoard } from "@/components/strategy/opportunity-board";
import { generatorLabel } from "@/lib/ai";
import { withUser } from "@/lib/db";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";
import { generateOpportunitiesAction } from "@/lib/strategy/actions";

export const metadata: Metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ params, searchParams }: PageProps<"/projects/[projectId]/opportunities">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx, project } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, async (tx) => ({
    opps: await tx`select o.*, d.name as direction_name from opportunities o left join strategy_directions d on d.id = o.linked_direction_id where o.project_id = ${projectId}
      order by case o.status when 'saved' then 0 when 'investigating' then 1 when 'linked' then 2 when 'new' then 3 else 4 end, o.created_at desc`,
    evidence: await tx`select id, evidence_type, claim, review_status, is_demo, normalized_value, created_at from evidence_items where project_id = ${projectId} order by created_at desc limit 400`,
    dirs: await tx`select distinct on (version_id, slot) id, name from strategy_directions where project_id = ${projectId} and status <> 'superseded' order by version_id, slot, revision desc`,
    hasRun: (await tx`select 1 from research_runs where project_id = ${projectId} and status = 'completed' limit 1`).length > 0,
  }));
  const claims = new Map(data.evidence.map((e) => [e.id as string, e.claim as string]));
  const canEdit = can(ctx.workspace.role, "strategy.edit");
  const action = generateOpportunitiesAction.bind(null, projectId);
  return (
    <div>
      <div className="mb-10 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="cc-eyebrow text-muted">02 · Interpret</p>
          <h1 className="cc-display mt-3 text-5xl md:text-6xl">Opportunities worth investigating.</h1>
        </div>
        <div className="space-y-3 md:justify-self-end">
          <p className="max-w-md text-[14px] leading-relaxed text-muted">Each opportunity is a hypothesis tied to specific observations — not a guaranteed market opening. Save, investigate or link them to a strategy direction.</p>
          {canEdit && data.hasRun && <GenerateButton action={action} label={data.opps.length ? "Regenerate suggestions" : "Generate opportunities"} pendingLabel="Reading evidence…" successTitle="Opportunities generated" autoStart={sp.generate === "1" && data.opps.length === 0} />}
          {!data.hasRun && <p className="text-[13px] text-muted">Complete a research run first.</p>}
        </div>
      </div>
      <OpportunityBoard
        projectId={projectId}
        canEdit={canEdit}
        theme={themeForCategory(project.category)}
        directions={data.dirs.map((d) => ({ id: d.id, name: d.name }))}
        evidence={data.evidence.map((e) => ({ id: e.id, type: e.evidence_type, claim: e.claim, review: e.review_status, isDemo: e.is_demo, value: e.normalized_value === null ? null : Number(e.normalized_value), createdAt: new Date(e.created_at).toISOString() }))}
        opportunities={data.opps.map((o) => ({
          id: o.id, title: o.title, description: o.description, whyItMatters: o.why_it_matters, unknowns: o.unknowns, strategicUse: o.strategic_use, validationStep: o.validation_step,
          status: o.status, generator: o.generator, generatorLabel: generatorLabel(o.generator), isDemo: o.is_demo, linkedDirection: o.direction_name,
          evidence: (o.evidence_ids as string[]).map((id) => ({ id, claim: claims.get(id) ?? "Evidence item" })), entityNames: [],
        }))}
      />
    </div>
  );
}
