import type { Metadata } from "next";
import { EmptyState } from "@/components/states";
import { ComparisonMatrix, RevisionDiff } from "@/components/strategy/compare-view";
import { llmConfigured, TEMPLATE_GENERATOR } from "@/lib/ai";
import type { DirectionContent } from "@/lib/ai/schemas";
import { templateComparison } from "@/lib/ai/template";
import { withUser } from "@/lib/db";
import { loadBrief } from "@/lib/data/briefs";
import { getProjectContext } from "@/lib/data/project-context";
import { isUuid } from "@/lib/data/projects";
import { getStrategy } from "@/lib/data/strategy";

export const metadata: Metadata = { title: "Compare directions" };

export default async function ComparePage({ params, searchParams }: PageProps<"/projects/[projectId]/strategy/compare">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx } = await getProjectContext(projectId);
  const s = await getStrategy(ctx, projectId);
  const directionId = typeof sp.direction === "string" && isUuid(sp.direction) ? sp.direction : null;
  const extra = await withUser(ctx.user.id, async (tx) => {
    const brief = (await loadBrief(tx, projectId))!;
    let revisions: { id: string; revision: number; name: string; note: string | null; status: string; createdAt: string; content: Record<string, unknown> }[] = [];
    if (directionId) {
      const [d] = await tx`select version_id, slot from strategy_directions where id = ${directionId} and project_id = ${projectId}`;
      if (d) {
        const rows = await tx`select id, revision, name, revision_note, status, created_at, content from strategy_directions where version_id = ${d.version_id} and slot = ${d.slot} order by revision`;
        revisions = rows.map((r) => ({ id: r.id, revision: r.revision, name: r.name, note: r.revision_note, status: r.status, createdAt: new Date(r.created_at).toISOString(), content: r.content }));
      }
    }
    return { brief, revisions };
  });
  const dirs = s.directions.map((d) => ({ name: d.name, content: d.content as DirectionContent, evidenceCount: d.evidence.length }));
  return (
    <div className="space-y-12">
      <div>
        <p className="cc-eyebrow text-muted">03 · Create · Compare</p>
        <h1 className="cc-display mt-3 text-5xl md:text-6xl">Compare with your eyes open.</h1>
        <p className="mt-3 max-w-2xl text-[14px] text-muted">Transparent, qualitative assessments — each with the basis for the judgement. There is no single “cultural fit score”.</p>
      </div>
      {extra.revisions.length > 1 && (
        <div>
          <h2 className="mb-4 text-[15px] font-semibold">Versions of “{extra.revisions.at(-1)!.name}”</h2>
          <RevisionDiff revisions={extra.revisions} />
        </div>
      )}
      {!s.current ? (
        <EmptyState title="Nothing to compare yet" body="Generate strategy directions first." action={{ href: `/projects/${projectId}/strategy`, label: "Open strategy studio" }} />
      ) : (
        <div>
          <h2 className="mb-4 text-[15px] font-semibold">Version {s.current.version}: directions across dimensions</h2>
          <ComparisonMatrix projectId={projectId} versionId={s.current.id} names={dirs.map((d) => d.name)} initial={templateComparison(dirs, extra.brief)} initialGenerator={TEMPLATE_GENERATOR} llm={llmConfigured()} />
        </div>
      )}
    </div>
  );
}
