import { llmEnabled } from "@/lib/ai/enabled";
import type { Metadata } from "next";
import { themeForCategory } from "@/components/art/plate";
import { ResearchWorkspace } from "@/components/research/research-workspace";
import { generatorLabel } from "@/lib/ai";
import { loadConversation } from "@/lib/ai/copilot-actions";
import { withUser } from "@/lib/db";
import { demoModeAllowed, env } from "@/lib/env";
import { loadBrief } from "@/lib/data/briefs";
import { getProjectContext } from "@/lib/data/project-context";
import { getResearchView } from "@/lib/data/research";
import { firstName } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";
import { providerRegistry } from "@/lib/research/deep/registry";
import { buildPlan } from "@/lib/research/engine";

export const metadata: Metadata = { title: "Cultural research" };
// Research jobs run in after(): give them room to finish the bounded deep profile (≈ 270 s).
export const maxDuration = 300;

export default async function ResearchPage({ params, searchParams }: PageProps<"/projects/[projectId]/research">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx, project, stages } = await getProjectContext(projectId);
  const view = await getResearchView(ctx, projectId, typeof sp.run === "string" ? sp.run : null);
  const { brief, featured, oppCount, webEnabled } = await withUser(ctx.user.id, async (tx) => {
    const [f] = await tx`select id, title, description, is_demo, generator, cardinality(evidence_ids) as n from opportunities
      where project_id = ${projectId} and status in ('saved','investigating','linked','new') order by (status = 'saved') desc, updated_at desc limit 1`;
    const [{ count }] = await tx`select count(*)::int from opportunities where project_id = ${projectId} and status <> 'dismissed'`;
    const [web] = await tx`select enabled from integration_settings where workspace_id = ${ctx.workspace.workspaceId} and provider = 'web_research'`;
    return { brief: await loadBrief(tx, projectId), featured: f, oppCount: count as number, webEnabled: web ? Boolean(web.enabled) : true };
  });
  const plan = buildPlan(brief!);
  const copilot = await loadConversation(projectId);
  return (
    <ResearchWorkspace
      project={{ id: project.id, name: project.name, category: project.category, market: project.market, isDemo: project.isDemo, description: [brief?.product, brief?.audience ? `for ${brief.audience}` : null].filter(Boolean).join(" ").slice(0, 140) || [project.category, project.market].filter(Boolean).join(" · ") }}
      theme={themeForCategory(project.category)}
      stages={stages}
      run={view.run}
      runs={view.runs}
      entities={view.entities}
      relationships={view.relationships}
      sources={view.sources}
      plan={{ question: plan.question, seeds: plan.seedQueries.map((s) => s.query), location: plan.location, targets: plan.targets, notes: plan.notes }}
      featured={featured ? { id: featured.id, title: featured.title, description: featured.description, isDemo: featured.is_demo, generator: featured.generator, evidenceCount: featured.n } : null}
      opportunityCount={oppCount}
      canRun={can(ctx.workspace.role, "research.run")}
      demoAllowed={demoModeAllowed()}
      qlooConfigured={Boolean(env().QLOO_API_KEY)}
      llm={await llmEnabled(ctx.user.id, ctx.workspace.workspaceId)}
      generatorLabel={view.run?.interpretationGenerator ? generatorLabel(view.run.interpretationGenerator) : null}
      copilot={copilot}
      user={{ name: firstName(ctx), workspace: ctx.workspace.name }}
      deep={view.deep}
      providers={providerRegistry({ demo: false }).map(({ key, label, capability, strengths, configured, unavailableReason, costModel, verified }) => ({ key, label, capability, strengths, configured, unavailableReason, costModel, verified }))}
      webEnabled={webEnabled}
    />
  );
}
