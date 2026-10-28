import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { StageInfo } from "@/components/nav/stage-nav";
import type { StageKey } from "@/lib/stages";
import { getProjectSummary, stageStates, type ProjectSummary } from "./projects";
import { getCtx } from "./workspace";

export const getProjectContext = cache(async (projectId: string) => {
  const ctx = await getCtx();
  const project = await getProjectSummary(ctx, projectId);
  if (!project) notFound();
  return { ctx, project, stages: stageInfo(project) };
});

export function stageInfo(p: ProjectSummary): Record<StageKey, StageInfo> {
  const s = stageStates(p);
  return {
    explore: { state: s.explore, missing: s.explore === "done" ? null : p.briefFilled < 4 ? `Brief ${p.briefFilled}/6 core fields` : p.lastRunStatus === "failed" ? "Last research run failed" : !p.lastRunStatus ? "No research run yet" : p.lastRunStatus !== "completed" ? "Research in progress" : null },
    interpret: { state: s.interpret, missing: s.interpret === "done" ? null : p.evidenceCount === 0 ? "Needs research evidence" : "No opportunities yet" },
    create: { state: s.create, missing: s.create === "done" ? null : p.strategyCount === 0 ? "No directions generated" : !p.hasSelectedDirection ? "No direction selected" : "No creative brief" },
    test: { state: s.test, missing: s.test === "done" ? null : p.experimentCount === 0 ? "No experiments planned" : "No results recorded" },
    track: { state: s.track, missing: s.track === "done" ? null : "No report yet" },
  };
}
