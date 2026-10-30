import { llmEnabled } from "@/lib/ai/enabled";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { themeForCategory } from "@/components/art/plate";
import { EmptyState } from "@/components/states";
import { GenerateButton } from "@/components/strategy/generate-button";
import { CompareLink, StrategyStudio } from "@/components/strategy/strategy-studio";
import { RedTeamButton } from "@/components/strategy/red-team-dialog";
import { Button } from "@/components/ui/button";
import { generatorLabel } from "@/lib/ai";
import { getProjectContext } from "@/lib/data/project-context";
import { getStrategy } from "@/lib/data/strategy";
import { can } from "@/lib/permissions";
import { generateCreativeBriefAction, generateStrategyAction } from "@/lib/strategy/actions";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Strategy studio" };

export default async function StrategyPage({ params, searchParams }: PageProps<"/projects/[projectId]/strategy">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx, project } = await getProjectContext(projectId);
  const s = await getStrategy(ctx, projectId, typeof sp.version === "string" ? Number(sp.version) : null);
  const canEdit = can(ctx.workspace.role, "strategy.edit");
  const llm = await llmEnabled(ctx.user.id, ctx.workspace.workspaceId);
  return (
    <div>
      <div className="mb-10 grid gap-6 md:grid-cols-[1.25fr_1fr] md:items-end">
        <div>
          <p className="cc-eyebrow text-muted">03 · Create · Strategy studio</p>
          <h1 className="cc-display mt-3 text-5xl md:text-6xl">Three ways to win, side by side.</h1>
        </div>
        <div className="space-y-3 md:justify-self-end">
          <p className="max-w-md text-[14px] leading-relaxed text-muted">Directions differ in strategic rationale, not just wording. Edits and AI revisions create new versions; a selected direction is never overwritten.</p>
          <div className="flex flex-wrap gap-2">
            {canEdit && <GenerateButton action={generateStrategyAction.bind(null, projectId)} label={s.current ? "Generate new version" : "Generate three directions"} pendingLabel="Drafting directions…" successTitle="Strategy directions generated" />}
            {s.current && <CompareLink projectId={projectId} />}
            {s.current && <RedTeamButton projectId={projectId} versionId={s.current.id} llm={llm} canEdit={canEdit} saved={s.critique} />}
            {project.hasSelectedDirection && (project.creativeBriefCount > 0
              ? <Button asChild variant="soft"><Link href={`/projects/${projectId}/creative-brief`}>Open creative brief <ArrowRight /></Link></Button>
              : canEdit && <GenerateButton variant="accent" action={generateCreativeBriefAction.bind(null, projectId)} label="Generate creative brief" pendingLabel="Writing brief…" successTitle="Creative brief created" />)}
          </div>
          {!llm && <p className="text-[11px] text-faint">No LLM configured: the studio drafts labelled scaffolds from the brief and stored evidence — starting points for your team to write, not finished directions.</p>}
        </div>
      </div>
      {s.versions.length > 1 && (
        <nav aria-label="Strategy versions" className="mb-5 flex flex-wrap gap-1.5">
          {s.versions.map((v) => (
            <Link key={v.id} href={`/projects/${projectId}/strategy?version=${v.version}`} className={cn("rounded-full border px-3 py-1.5 text-[12px]", v.id === s.current?.id ? "border-ink bg-ink text-white" : "border-line bg-paper hover:bg-ivory")}>
              Version {v.version} · {formatDateTime(v.createdAt)}
            </Link>
          ))}
        </nav>
      )}
      {!s.current ? (
        <EmptyState title="No directions yet" body={project.evidenceCount === 0 ? "You can generate directions from the brief alone, but they will be marked exploratory. Running research first grounds them in evidence." : "Generate three positioning directions grounded in this campaign’s evidence and saved opportunities."} />
      ) : (
        <StrategyStudio projectId={projectId} directions={s.directions} canEdit={canEdit} llm={llm} generatorLabel={generatorLabel(s.current.generator)} isDemo={s.current.isDemo} theme={themeForCategory(project.category)} />
      )}
    </div>
  );
}
