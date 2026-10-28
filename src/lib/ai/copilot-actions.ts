"use server";

import { z } from "zod";
import { withUser } from "@/lib/db";
import { loadBrief } from "@/lib/data/briefs";
import { isUuid } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { generateStructured, llmConfigured, tag, TEMPLATE_GENERATOR } from "./index";
import { readObservations } from "./context";
import { copilotAnswerSchema, type CopilotAnswer } from "./schemas";
import { templateCopilot } from "./template";

export type CopilotMessage = { id: string; role: "user" | "assistant"; content: string; generator: string | null; cited: string[]; action: CopilotAnswer["proposedAction"] | null; createdAt: string };
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
    return { brief, observations: [...new Map([...focused, ...observations].map((o) => [o.id, o])).values()], dirs, opps, history: history.reverse() };
  });
  if (!gathered) return { ok: false, error: "Project not found." };

  let answer: CopilotAnswer;
  let generator = TEMPLATE_GENERATOR;
  if (llmConfigured()) {
    try {
      const out = await generateStructured({
        schema: copilotAnswerSchema,
        maxTokens: 6000,
        prompt: [
          "Answer the strategist's question about this campaign using only the supplied context. Cite evidence ids you rely on. If the context cannot answer it, say what is missing. You may propose ONE follow-up action; it will only run if the user confirms.",
          tag("brief", JSON.stringify({ name: gathered.brief.name, brand: gathered.brief.brand, category: gathered.brief.category, market: gathered.brief.market, audience: gathered.brief.audience, objective: gathered.brief.objective })),
          tag("evidence", JSON.stringify({ observations: gathered.observations.map((o) => ({ id: o.id, entity: o.entityName, type: o.entityType, affinity: o.affinity, role: o.role })), directions: gathered.dirs, opportunities: gathered.opps })),
          tag("user_request", JSON.stringify({ previous: gathered.history, question })),
        ].join("\n\n"),
      });
      const valid = new Set(gathered.observations.map((o) => o.id));
      answer = { ...out.data, citedEvidenceIds: out.data.citedEvidenceIds.filter((id) => valid.has(id)) };
      generator = out.generator;
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
      values (${conversationId}, ${ws}, 'assistant', ${answer.answer}, ${tx.json({ cited: answer.citedEvidenceIds, action: answer.proposedAction } as never)}, ${generator}) returning id, created_at`;
    await tx`update conversations set updated_at = now() where id = ${conversationId}`;
    return {
      ok: true as const,
      conversationId: conversationId!,
      message: { id: m.id, role: "assistant" as const, content: answer.answer, generator, cited: answer.citedEvidenceIds, action: answer.proposedAction.type === "none" ? null : answer.proposedAction, createdAt: new Date(m.created_at).toISOString() },
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
      messages: rows.reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, generator: r.generator, cited: r.tool_calls?.cited ?? [], action: r.tool_calls?.action?.type && r.tool_calls.action.type !== "none" ? r.tool_calls.action : null, createdAt: new Date(r.created_at).toISOString() })),
    };
  });
}
