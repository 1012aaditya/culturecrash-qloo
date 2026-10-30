import { NextResponse } from "next/server";
import { withUser } from "@/lib/db";
import { getPollingUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/projects";
import { sweepStaleRuns } from "@/lib/research/lifecycle";

/** Lightweight status endpoint polled while a run is in progress. RLS scopes visibility. */
export async function GET(_: Request, { params }: RouteContext<"/api/projects/[projectId]/runs/[runId]">) {
  const user = await getPollingUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projectId, runId } = await params;
  if (!isUuid(projectId) || !isUuid(runId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const run = await withUser(user.id, async (tx) => {
    // Polling is how a client notices a dead worker: close it here, then report the closed state.
    await sweepStaleRuns(tx, projectId);
    const [r] = await tx`select r.id, r.status, r.mode, r.depth, r.stage, r.error_code, r.error_message, r.updated_at, r.cancel_requested_at is not null as cancel_requested,
      (r.usage->>'usdEstimated')::numeric as usd_estimated,
      (select count(*) from research_sources s where s.run_id = r.id)::int as calls,
      (select count(*) from research_sources s where s.run_id = r.id and s.status = 'error')::int as failed_calls,
      (select count(*) from cultural_entities e where e.run_id = r.id)::int as entities,
      (select count(*) from research_documents d where d.run_id = r.id and d.duplicate_of is null)::int as documents,
      (select count(*) from evidence_items ev where ev.run_id = r.id and ev.claim_type in ('source_fact','source_opinion','observed_measurement'))::int as claims
      from research_runs r where r.id = ${runId} and r.project_id = ${projectId}`;
    return r;
  });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}
