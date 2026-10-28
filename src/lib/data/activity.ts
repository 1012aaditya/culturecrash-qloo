import "server-only";
import type { Tx } from "@/lib/db";

export async function logActivity(
  tx: Tx,
  a: { workspaceId: string; actorId: string; projectId?: string | null; verb: string; objectType: string; objectId?: string | null; summary: string },
) {
  await tx`
    insert into activity_events (workspace_id, project_id, actor_id, verb, object_type, object_id, summary)
    values (${a.workspaceId}, ${a.projectId ?? null}, ${a.actorId}, ${a.verb}, ${a.objectType}, ${a.objectId ?? null}, ${a.summary.slice(0, 280)})`;
}

export type UsageEvent =
  | "project_created" | "brief_completed" | "research_run_started" | "research_run_completed" | "research_run_failed"
  | "strategy_generated" | "strategy_selected" | "report_exported" | "experiment_created" | "experiment_result_recorded"
  | "creative_brief_generated" | "report_shared";

/** Product analytics: event names and ids only, never brief or research content. */
export async function trackEvent(
  tx: Tx,
  e: { workspaceId: string; userId: string; event: UsageEvent; projectId?: string | null; metadata?: Record<string, string | number | boolean | null> },
) {
  await tx`
    insert into usage_events (workspace_id, user_id, project_id, event, metadata)
    values (${e.workspaceId}, ${e.userId}, ${e.projectId ?? null}, ${e.event}, ${tx.json(e.metadata ?? {})})`;
}
