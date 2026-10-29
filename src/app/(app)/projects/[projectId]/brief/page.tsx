import { llmEnabled } from "@/lib/ai/enabled";
import type { Metadata } from "next";
import { BriefEditor } from "@/components/brief/brief-editor";
import { withUser } from "@/lib/db";
import { loadBrief, validateBrief } from "@/lib/data/briefs";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Brief" };

export default async function BriefPage({ params, searchParams }: PageProps<"/projects/[projectId]/brief">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { ctx, project } = await getProjectContext(projectId);
  const { brief, docs } = await withUser(ctx.user.id, async (tx) => ({
    brief: await loadBrief(tx, projectId),
    docs: await tx`select id, file_name, size_bytes, extraction_status, storage_path, extracted_text, created_at from brief_documents where project_id = ${projectId} order by created_at desc`,
  }));
  const b = brief!;
  return (
    <div>
      <div className="mb-8 grid gap-4 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <p className="cc-eyebrow text-muted">01 · Explore · Brief</p>
          <h1 className="cc-display mt-3 text-5xl md:text-6xl">{sp.new ? "Tell us about the campaign." : "Campaign brief"}</h1>
        </div>
        <p className="max-w-md text-[14px] leading-relaxed text-muted md:justify-self-end">
          Changes save automatically. The brief drives which signals are sent to Qloo and what strategies are assessed against.
        </p>
      </div>
      <BriefEditor
        projectId={projectId}
        revision={b.revision}
        updatedAt={b.updatedAt}
        canEdit={can(ctx.workspace.role, "brief.edit") && project.status !== "archived"}
        llm={await llmEnabled(ctx.user.id, ctx.workspace.workspaceId)}
        issues={validateBrief(b)}
        initial={{
          brand: b.brand, product: b.product, category: b.category, market: b.market, audience: b.audience, objective: b.objective,
          existingPositioning: b.existingPositioning, brandGuidelines: b.brandGuidelines, budgetRange: b.budgetRange, timeframe: b.timeframe,
          additionalContext: b.additionalContext, competitors: b.competitors, publicUrls: b.publicUrls,
        }}
        documents={docs.map((d) => ({ id: d.id, fileName: d.file_name, size: d.size_bytes, status: d.extraction_status, stored: Boolean(d.storage_path), text: d.extracted_text, createdAt: new Date(d.created_at).toISOString() }))}
      />
    </div>
  );
}
