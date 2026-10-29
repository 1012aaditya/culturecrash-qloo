import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/data/projects";

export const dynamic = "force-dynamic";

const body = z.object({
  page: z.string().regex(/^[a-z-]{1,40}$/),
  field: z.string().regex(/^[A-Za-z0-9_.-]{1,60}$/).nullable(),
  leave: z.boolean().optional(),
});

export type PresencePeer = { userId: string; name: string; page: string; field: string | null; updatedAt: string };

/**
 * Heartbeat + read in one request: records where the caller is (page and focused field)
 * and returns the other people active on this project in the last 30 seconds.
 * RLS scopes both the write (own row, own workspace) and the read (workspace members).
 */
export async function POST(req: Request, { params }: RouteContext<"/api/projects/[projectId]/presence">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  if (!isUuid(projectId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { page, field, leave } = parsed.data;

  const peers = await withUser(user.id, async (tx) => {
    const [p] = await tx`select workspace_id from projects where id = ${projectId}`;
    if (!p) return null;
    if (leave) {
      await tx`delete from presence where user_id = ${user.id} and project_id = ${projectId}`;
      return [];
    }
    await tx`insert into presence (user_id, project_id, workspace_id, page, field, updated_at)
      values (${user.id}, ${projectId}, ${p.workspace_id}, ${page}, ${field}, now())
      on conflict (user_id, project_id) do update set page = excluded.page, field = excluded.field, updated_at = now()`;
    return tx`select pr.user_id, coalesce(pf.full_name, pf.email) as name, pr.page, pr.field, pr.updated_at
      from presence pr join profiles pf on pf.id = pr.user_id
      where pr.project_id = ${projectId} and pr.user_id <> ${user.id} and pr.updated_at > now() - interval '30 seconds'
      order by pr.updated_at desc limit 12`;
  });
  if (peers === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    peers: peers.map((r): PresencePeer => ({ userId: r.user_id, name: r.name, page: r.page, field: r.field, updatedAt: new Date(r.updated_at).toISOString() })),
  }, { headers: { "Cache-Control": "no-store" } });
}
