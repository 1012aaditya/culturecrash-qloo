"use server";

import { llmEnabled } from "@/lib/ai/enabled";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { loadBrief } from "@/lib/data/briefs";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { qloo as qlooClient } from "@/lib/providers/qloo";
import { runCopilotAgent, type AgentStep } from "./copilot-agent";
import { QlooSession, type QlooRef } from "./copilot-qloo";
import { tag, TEMPLATE_GENERATOR } from "./index";
import { readObservations } from "./context";
import type { CopilotAnswer } from "./schemas";
import { templateCopilot } from "./template";

export type CopilotMessage = { id: string; role: "user" | "assistant"; content: string; generator: string | null; cited: string[]; action: CopilotAnswer["proposedAction"] | null; steps: AgentStep[]; qloo: QlooRef[]; createdAt: string };
export type CopilotResult = { ok: true; conversationId: string; message: CopilotMessage } | { ok: false; error: string };

const input = z.object({ projectId: z.string().refine(isUuid), conversationId: z.string().refine(isUuid).nullable(), question: z.string().trim().min(2).max(2000) });

export async function askCopilotAction(raw: z.input<typeof input>): Promise<CopilotResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ask a question between 2 and 2000 characters." };
  const { projectId, question } = parsed.data;
  const ctx = await getCtx();
  const ws = ctx.workspace.workspaceId;

  // Read tools (server-side, authorised by RLS for this project only).
  const gathered = await withUser(ctx.user.id, async (tx) => {
    const brief = await loadBrief(tx, projectId);
    if (!brief) return null;
    const keyword = question.split(/\s+/).find((w) => w.length > 5 && /^[\p{L}-]+$/u.test(w));
    const observations = await readObservations(tx, projectId, { limit: 60 });
    const focused = keyword ? await readObservations(tx, projectId, { limit: 10, keyword }) : [];
    const dirs = await tx`select id, name, content->>'coreIdea' as core from strategy_directions where project_id = ${projectId} and status <> 'superseded' order by created_at desc limit 6`;
    const opps = await tx`select title, status from opportunities where project_id = ${projectId} and status <> 'dismissed' order by updated_at desc limit 8`;
    const history = parsed.data.conversationId
      ? await tx`select role, content from conversation_messages where conversation_id = ${parsed.data.conversationId} order by created_at desc limit 6`
      : [];
    // Live Qloo lookups follow the workspace's Qloo switch in Settings → Integrations, like research does.
    const [qs] = await tx`select enabled from integration_settings where workspace_id = ${ws} and provider = 'qloo'`;
    return { qlooOn: !qs || Boolean(qs.enabled), brief, observations: [...new Map([...focused, ...observations].map((o) => [o.id, o])).values()], dirs, opps, history: history.reverse() };
  });
  if (!gathered) return { ok: false, error: "Project not found." };

  let answer: CopilotAnswer;
  let generator = TEMPLATE_GENERATOR;
  let steps: AgentStep[] = [];
  let qloo: QlooRef[] = [];
  if (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId)) {
    try {
      // A compact starting context; the agent looks up anything else it needs with its read-only tools.
      const top = gathered.observations.slice(0, 20);
      const client = qlooClient();
      const out = await runCopilotAgent({
        userId: ctx.user.id,
        projectId,
        qloo: gathered.qlooOn && client.configured ? new QlooSession(client) : null,
        context: [
          tag("brief", JSON.stringify({ name: gathered.brief.name, brand: gathered.brief.brand, category: gathered.brief.category, market: gathered.brief.market, audience: gathered.brief.audience, objective: gathered.brief.objective, competitors: gathered.brief.competitors, interests: gathered.brief.interests ?? [] })),
          tag("evidence", JSON.stringify({ topObservations: top.map((o) => ({ id: o.id, text: o.claim.slice(0, 280), entity: o.entityName, type: o.entityType, affinity: o.affinity, role: o.role })), totalObservations: gathered.observations.length, directions: gathered.dirs.map((d) => d.name), opportunities: gathered.opps })),
        ].join("\n\n"),
        question: tag("user_request", JSON.stringify({ previous: gathered.history, question })),
      });
      const valid = new Set([...top.map((o) => o.id), ...out.seenEvidenceIds]);
      answer = { ...out.answer, citedEvidenceIds: out.answer.citedEvidenceIds.filter((id) => valid.has(id)) };
      generator = out.generator;
      steps = out.steps;
      qloo = out.qloo;
    } catch {
      return { ok: false, error: "The assistant could not answer right now (LLM request failed). Nothing was saved." };
    }
  } else {
    answer = templateCopilot(question, { brief: gathered.brief, observations: gathered.observations, directionNames: gathered.dirs.map((d) => d.name as string) });
  }

  return withUser(ctx.user.id, async (tx) => {
    let conversationId = parsed.data.conversationId;
    if (conversationId) {
      const [c] = await tx`select id from conversations where id = ${conversationId} and project_id = ${projectId}`;
      if (!c) conversationId = null;
    }
    if (!conversationId) {
      const [c] = await tx`insert into conversations (project_id, workspace_id, user_id, title) values (${projectId}, ${ws}, ${ctx.user.id}, ${question.slice(0, 80)}) returning id`;
      conversationId = c.id as string;
    }
    await tx`insert into conversation_messages (conversation_id, workspace_id, role, content) values (${conversationId}, ${ws}, 'user', ${question})`;
    const [m] = await tx`insert into conversation_messages (conversation_id, workspace_id, role, content, tool_calls, generator)
      values (${conversationId}, ${ws}, 'assistant', ${answer.answer}, ${tx.json({ cited: answer.citedEvidenceIds, action: answer.proposedAction, steps, qloo } as never)}, ${generator}) returning id, created_at`;
    await tx`update conversations set updated_at = now() where id = ${conversationId}`;
    return {
      ok: true as const,
      conversationId: conversationId!,
      message: { id: m.id, role: "assistant" as const, content: answer.answer, generator, cited: answer.citedEvidenceIds, action: answer.proposedAction.type === "none" ? null : answer.proposedAction, steps, qloo, createdAt: new Date(m.created_at).toISOString() },
    };
  });
}

export async function loadConversation(projectId: string): Promise<{ conversationId: string | null; messages: CopilotMessage[] }> {
  if (!isUuid(projectId)) return { conversationId: null, messages: [] };
  const ctx = await getCtx();
  return withUser(ctx.user.id, async (tx) => {
    const [c] = await tx`select id from conversations where project_id = ${projectId} and user_id = ${ctx.user.id} order by updated_at desc limit 1`;
    if (!c) return { conversationId: null, messages: [] };
    const rows = await tx`select id, role, content, generator, tool_calls, created_at from conversation_messages where conversation_id = ${c.id} order by created_at desc limit 20`;
    return {
      conversationId: c.id,
      messages: rows.reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, generator: r.generator, cited: r.tool_calls?.cited ?? [], action: r.tool_calls?.action?.type && r.tool_calls.action.type !== "none" ? r.tool_calls.action : null, steps: Array.isArray(r.tool_calls?.steps) ? r.tool_calls.steps : [], qloo: Array.isArray(r.tool_calls?.qloo) ? r.tool_calls.qloo : [], createdAt: new Date(r.created_at).toISOString() })),
    };
  });
}
