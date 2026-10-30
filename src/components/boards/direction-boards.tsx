import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { boardsForDirections, type LinkedBoard } from "@/lib/boards/data";
import { getProjectContext } from "@/lib/data/project-context";

function BoardPreview({ projectId, board }: { projectId: string; board: LinkedBoard }) {
  return (
    <Link href={`/projects/${projectId}/boards/${board.id}`} className="cc-lift block overflow-hidden rounded-cc-lg border border-line bg-paper shadow-card">
      <div className="cc-atmosphere grid h-36 grid-cols-3 gap-1 bg-ivory p-2">
        {board.previewUrls.length ? board.previewUrls.slice(0, 6).map((u) => (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
          <img key={u} src={u} alt="" className="h-full w-full rounded-[8px] object-cover" />
        )) : <span className="col-span-3 self-center text-center text-[12px] text-muted">{board.cardCount} cards, no images yet</span>}
      </div>
      <div className="flex items-center justify-between gap-3 p-3">
        <p className="truncate text-[14px] font-medium tracking-tight">{board.name}</p>
        {board.palette.length > 0 && (
          <span className="flex shrink-0 -space-x-1" aria-label={`Palette: ${board.palette.join(", ")}`}>
            {board.palette.slice(0, 6).map((c) => <span key={c} className="size-4 rounded-full border-2 border-paper" style={{ background: c }} />)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** The board linked to the direction a creative brief was written from: its visual world and palette. */
export async function VisualDirectionPanel({ projectId, directionId }: { projectId: string; directionId: string | null }) {
  if (!directionId) return null;
  const { ctx } = await getProjectContext(projectId);
  const boards = (await boardsForDirections(ctx, projectId, [directionId])).get(directionId) ?? [];
  return (
    <section className="mt-8 rounded-[32px] border border-line bg-paper p-8" aria-labelledby="visual-direction">
      <h2 id="visual-direction" className="cc-display text-3xl">Visual direction</h2>
      <p className="mt-1 text-[13px] text-muted">The inspiration board linked to this direction. References are internal unless their sources say otherwise.</p>
      {boards.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">
          No board is linked to this direction yet. Open a board and choose this direction in its toolbar, or{" "}
          <Link href={`/projects/${projectId}/boards`} className="text-violet-ink hover:underline">start a board</Link>.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{boards.map((b) => <BoardPreview key={b.id} projectId={projectId} board={b} />)}</div>
      )}
    </section>
  );
}

/** Each direction's linked boards side by side, so the visual worlds can be compared like the strategy. */
export async function DirectionBoardsSection({ projectId, directions }: { projectId: string; directions: { id: string; name: string; slot: number }[] }) {
  if (!directions.length) return null;
  const { ctx } = await getProjectContext(projectId);
  const byDirection = await boardsForDirections(ctx, projectId, directions.map((d) => d.id));
  return (
    <div>
      <h2 className="mb-1 text-[15px] font-semibold">Visual worlds</h2>
      <p className="mb-4 text-[13px] text-muted">The inspiration board linked to each direction. Link a board from the direction picker in its toolbar.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {directions.map((d) => {
          const boards = byDirection.get(d.id) ?? [];
          return (
            <div key={d.id} className="space-y-2">
              <p className="cc-eyebrow text-muted">Direction 0{d.slot}</p>
              <p className="text-[14px] font-medium tracking-tight">{d.name}</p>
              {boards.length ? boards.slice(0, 2).map((b) => <BoardPreview key={b.id} projectId={projectId} board={b} />) : (
                <Link href={`/projects/${projectId}/boards`} className="flex h-36 flex-col items-center justify-center gap-1.5 rounded-cc-lg border border-dashed border-line-strong bg-paper/60 text-[12px] text-muted hover:text-ink">
                  <LayoutGrid className="size-4" /> No board linked
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
