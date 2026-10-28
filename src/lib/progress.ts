// Pure workflow-progress helpers shared by server and client components.
export type StageState = "empty" | "partial" | "done";

export type ProjectSummary = {
  id: string;
  name: string;
  category: string | null;
  market: string | null;
  status: "draft" | "active" | "archived";
  isDemo: boolean;
  clientId: string | null;
  clientName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  updatedAt: string;
  createdAt: string;
  briefFilled: number;
  lastRunStatus: "queued" | "running" | "completed" | "failed" | null;
  lastRunMode: "live" | "demo" | null;
  evidenceCount: number;
  opportunityCount: number;
  strategyCount: number;
  hasSelectedDirection: boolean;
  creativeBriefCount: number;
  experimentCount: number;
  resultCount: number;
  reportCount: number;
};

export const BRIEF_CORE_FIELDS = ["brand", "product", "category", "market", "audience", "objective"] as const;

/** Workflow progress derived from persisted records, never estimated. */
export function stageStates(p: ProjectSummary): Record<"explore" | "interpret" | "create" | "test" | "track", StageState> {
  return {
    explore: p.lastRunStatus === "completed" && p.briefFilled >= 4 ? "done" : p.briefFilled > 0 || p.lastRunStatus ? "partial" : "empty",
    interpret: p.opportunityCount > 0 ? "done" : p.evidenceCount > 0 ? "partial" : "empty",
    create: p.hasSelectedDirection && p.creativeBriefCount > 0 ? "done" : p.strategyCount > 0 ? "partial" : "empty",
    test: p.experimentCount > 0 && p.resultCount > 0 ? "done" : p.experimentCount > 0 ? "partial" : "empty",
    track: p.reportCount > 0 ? "done" : p.resultCount > 0 ? "partial" : "empty",
  };
}

export function currentStage(p: ProjectSummary) {
  const s = stageStates(p);
  const order = ["explore", "interpret", "create", "test", "track"] as const;
  return order.find((k) => s[k] !== "done") ?? "track";
}

