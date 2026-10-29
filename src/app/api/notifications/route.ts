import { withUser } from "@/lib/db";
import { readNotifications } from "@/lib/data/notifications";
import { getCtx } from "@/lib/data/workspace";

export const dynamic = "force-dynamic";

/** Polled by the command bar so the bell updates when background work finishes. */
export async function GET() {
  let ctx;
  try {
    ctx = await getCtx();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const data = await withUser(ctx.user.id, (tx) => readNotifications(tx, ctx.user.id, ctx.workspace.workspaceId));
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
