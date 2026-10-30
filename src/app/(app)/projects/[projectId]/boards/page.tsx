import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { BuildFromResearchButton, NewBoardButton } from "@/components/boards/new-board";
import { EmptyState } from "@/components/states";
import { Ago } from "@/components/ui/time";
import { listBoards } from "@/lib/boards/data";
import { getProjectContext } from "@/lib/data/project-context";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Inspiration boards" };

export default async function BoardsPage({ params }: PageProps<"/projects/[projectId]/boards">) {
  const { projectId } = await params;
  const { ctx, project } = await getProjectContext(projectId);
  const boards = await listBoards(ctx, projectId);
  const canEdit = can(ctx.workspace.role, "board.edit") && project.status !== "archived";
  return (
    <div>
      <div className="mb-10 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="cc-eyebrow text-muted">03 · Create · Inspiration boards</p>
          <h1 className="cc-display mt-3 text-5xl md:text-6xl">Give the strategy a look.</h1>
        </div>
        <div className="space-y-3 md:justify-self-end">
          <p className="max-w-md text-[14px] leading-relaxed text-muted">
            Collect references, notes, links and the cultural entities from your research on a free canvas. Every reference keeps its source.
          </p>
          {canEdit && <div className="flex flex-wrap gap-2"><NewBoardButton projectId={projectId} /><BuildFromResearchButton projectId={projectId} /></div>}
        </div>
      </div>
      {boards.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No boards yet"
          body="Start a board for a strategy direction, a campaign territory or a client meeting, or build one from your research: the strongest Qloo affinities by theme and the best-supported evidence, ready to rearrange."
          action={canEdit ? <div className="mt-1 flex flex-wrap gap-2"><NewBoardButton projectId={projectId} size="sm" /><BuildFromResearchButton projectId={projectId} size="sm" /></div> : undefined}
        />
      ) : (
        <ul className="cc-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id}>
              <Link href={`/projects/${projectId}/boards/${b.id}`} className="cc-lift group block overflow-hidden rounded-cc-lg border border-line bg-paper shadow-card">
                <div className="cc-atmosphere relative grid h-40 grid-cols-3 gap-1.5 bg-ivory p-3">
                  {b.previewUrls.length ? b.previewUrls.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img key={u} src={u} alt="" className="h-full w-full rounded-cc-sm object-cover" />
                  )) : <span className="col-span-3 self-center text-center text-[12px] text-muted">{b.cardCount ? `${b.cardCount} cards` : "Empty board"}</span>}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium tracking-tight">{b.name}</p>
                    <p className="text-[12px] text-muted">{b.cardCount} {b.cardCount === 1 ? "card" : "cards"} · updated <Ago value={b.updatedAt} /></p>
                  </div>
                  {b.palette.length > 0 && (
                    <span className="flex shrink-0 -space-x-1" aria-label={`Palette: ${b.palette.join(", ")}`}>
                      {b.palette.slice(0, 5).map((c) => <span key={c} className="size-4 rounded-full border-2 border-paper" style={{ background: c }} />)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
