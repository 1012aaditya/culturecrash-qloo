import { llmEnabled } from "@/lib/ai/enabled";
import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { ClaimList, GroundingScore } from "@/components/evidence/evidence-receipt";
import { DemoBadge, EmptyState } from "@/components/states";
import { CreativeBriefEditor } from "@/components/strategy/creative-brief-editor";
import { GenerateButton } from "@/components/strategy/generate-button";
import { Button } from "@/components/ui/button";
import { generatorLabel } from "@/lib/ai";
import { CREATIVE_SECTIONS } from "@/lib/ai/schemas";
import { withUser } from "@/lib/db";
import { loadCreativeBrief } from "@/lib/data/creative";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";
import { generateCreativeBriefAction } from "@/lib/strategy/actions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Creative brief" };

export default async function CreativeBriefPage({ params }: PageProps<"/projects/[projectId]/creative-brief">) {
  const { projectId } = await params;
  const { ctx, project } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, (tx) => loadCreativeBrief(tx, projectId));
  const canEdit = can(ctx.workspace.role, "strategy.edit");
  const generate = generateCreativeBriefAction.bind(null, projectId);
  if (!data) {
    return (
      <div className="max-w-2xl">
        <p className="cc-eyebrow text-muted">03 · Create · Creative brief</p>
        <h1 className="cc-display mt-3 text-5xl">No creative brief yet.</h1>
        <EmptyState className="mt-8" title={project.hasSelectedDirection ? "Ready to write" : "Select a direction first"} body={project.hasSelectedDirection ? "The creative brief is generated from the selected strategy direction and stays editable section by section." : "Choose a preferred direction in the strategy studio, then generate the brief here."}
          action={project.hasSelectedDirection ? (canEdit ? <GenerateButton action={generate} label="Generate creative brief" pendingLabel="Writing brief…" successTitle="Creative brief created" /> : null) : { href: `/projects/${projectId}/strategy`, label: "Open strategy studio" }} />
      </div>
    );
  }
  const { cb, evidence, grounding, receipts } = data;
  const sectionLabel = Object.fromEntries(CREATIVE_SECTIONS);
  return (
    <article className="mx-auto max-w-[1100px]">
      <header className="relative overflow-hidden rounded-[36px] bg-charcoal p-10 text-white md:p-14">
        <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-violet/40 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-72 rounded-full bg-peach/30 blur-[90px]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2"><p className="cc-eyebrow text-white/60">Creative brief · {project.clientName ?? "Internal"}</p>{cb.is_demo && <DemoBadge />}</div>
          <h1 className="cc-display mt-4 text-6xl md:text-7xl">{project.name}</h1>
          <p className="mt-4 text-white/75">From direction “{cb.direction_name ?? "deleted direction"}” (revision {cb.direction_revision ?? "—"})</p>
          <p className="mt-1 text-[12px] text-white/50">{generatorLabel(cb.generator)} · revision {cb.revision} · last edited {formatDateTime(cb.updated_at)}{cb.updated_by_name ? ` by ${cb.updated_by_name}` : ""}</p>
          <div className="cc-no-print mt-6 flex flex-wrap gap-2">
            <Button asChild variant="inverse"><a href={`/api/projects/${projectId}/creative-brief/export`}><Download /> Export with evidence (.md)</a></Button>
            {canEdit && <GenerateButton variant="ghost-dark" action={generate} label="Regenerate from selected direction" pendingLabel="Writing…" successTitle="New creative brief created" />}
            <Button asChild variant="ghost-dark"><Link href={`/projects/${projectId}/experiments?new=1`}>Plan an experiment</Link></Button>
          </div>
        </div>
      </header>
      <div className="mt-8 rounded-[32px] border border-line bg-paper px-6 md:px-12">
        <CreativeBriefEditor briefId={cb.id} content={cb.content} revision={cb.revision} canEdit={canEdit} llm={await llmEnabled(ctx.user.id, ctx.workspace.workspaceId)} />
      </div>
      {grounding.length > 0 && (
        <section className="mt-8 rounded-[32px] border border-line bg-paper p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="cc-display text-3xl">What this brief rests on</h2>
            <GroundingScore claims={grounding} />
          </div>
          <p className="mt-1 text-[13px] text-muted">The factual statements behind the brief, checked against the evidence each one cites. Open a [number] to see the source text.</p>
          <div className="mt-5 space-y-5 text-[13px] leading-relaxed">
            {[...new Set(grounding.map((g) => g.section))].map((sec) => (
              <div key={sec} className="grid gap-2 md:grid-cols-[200px_1fr]">
                <p className="font-medium">{sectionLabel[sec] ?? sec}</p>
                <ClaimList claims={grounding.filter((g) => g.section === sec)} receipts={receipts} projectId={projectId} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="mt-8 rounded-[32px] border border-line bg-paper p-8">
        <h2 className="cc-display text-3xl">Supporting evidence</h2>
        <p className="mt-1 text-[13px] text-muted">Observations linked to the selected direction. Affinity values describe taste correlations, not causation.</p>
        {evidence.length === 0 ? <p className="mt-4 text-[13px] text-muted">No evidence is linked to this direction — treat its claims as exploratory.</p> : (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[13px]">
            {evidence.map((e) => <li key={e.id}><Link className="hover:text-violet" href={`/projects/${projectId}/evidence/${e.id}`}>{e.claim}</Link> <span className="text-muted">— {e.source_provider}, retrieved {formatDateTime(e.retrieved_at)}</span></li>)}
          </ol>
        )}
      </section>
    </article>
  );
}
