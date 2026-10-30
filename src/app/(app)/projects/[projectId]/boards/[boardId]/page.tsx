import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardCanvas } from "@/components/boards/board-canvas";
import { boardDirections, boardEntities, boardEvidence, getBoard } from "@/lib/boards/data";
import { briefBrand, conceptsEnabled, pendingConcepts } from "@/lib/concepts/data";
import { getProjectContext } from "@/lib/data/project-context";
import { isUuid } from "@/lib/data/projects";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Inspiration board" };

export default async function BoardPage({ params }: PageProps<"/projects/[projectId]/boards/[boardId]">) {
  const { projectId, boardId } = await params;
  if (!isUuid(boardId)) notFound();
  const { ctx, project } = await getProjectContext(projectId);
  const [board, entities, evidence, directions, pending, brand] = await Promise.all([getBoard(ctx, projectId, boardId), boardEntities(ctx, projectId), boardEvidence(ctx, projectId), boardDirections(ctx, projectId), pendingConcepts(ctx, boardId), briefBrand(ctx, projectId)]);
  if (!board) notFound();
  const canEdit = can(ctx.workspace.role, "board.edit") && project.status !== "archived";
  const canComment = can(ctx.workspace.role, "comment.create");
  // Keyed by revision so "Reload" after a save conflict remounts the canvas with the newer board.
  return <BoardCanvas key={`${board.id}:${board.revision}`} board={board} entities={entities} evidence={evidence} directions={directions} canEdit={canEdit} canComment={canComment}
    concepts={canEdit && conceptsEnabled() ? { pending } : null} brand={brand} />;
}
