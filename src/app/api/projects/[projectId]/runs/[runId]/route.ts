import { NextResponse } from "next/server";
import { withUser } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/projects";

/** Lightweight status endpoint polled while a run is in progress. RLS scopes visibility. */
export async function GET(_: Request, { params }: RouteContext<"/api/projects/[projectId]/runs/[runId]">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projectId, runId } = await params;
  if (!isUuid(projectId) || !isUuid(runId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const run = await withUser(user.id, async (tx) => {
    const [r] = await tx`select r.id, r.status, r.mode, r.error_code, r.error_message, r.updated_at,
      (select count(*) from research_sources s where s.run_id = r.id)::int as calls,
      (select count(*) from cultural_entities e where e.run_id = r.id)::int as entities
      from research_runs r where r.id = ${runId} and r.project_id = ${projectId}`;
    return r;
  });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}
