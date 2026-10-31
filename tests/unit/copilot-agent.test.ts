import { beforeEach, describe, expect, it, vi } from "vitest";

const runTool = vi.fn();
vi.mock("@/lib/db", () => ({ withUser: (_u: string, fn: (tx: unknown) => unknown) => fn({}) }));
vi.mock("@/lib/ai/copilot-tools", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/copilot-tools")>()), runCopilotTool: (...a: unknown[]) => runTool(...a) }));

const { runCopilotAgent } = await import("@/lib/ai/copilot-agent");
const { QlooSession } = await import("@/lib/ai/copilot-qloo");

const answer = { answer: "Grounded answer", citedEvidenceIds: ["ev-1", "ev-made-up"], proposedAction: { type: "none", label: "" }, qlooRefs: [] as string[] };
const toolTurn = (id: string, name: string, input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }], parsed_output: null });
const finalTurn = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }], parsed_output: answer };

describe("copilot agent loop", () => {
  beforeEach(() => runTool.mockReset());

  it("runs read-only tools, returns their results in one message, then the structured answer", async () => {
    runTool.mockResolvedValue({ result: [{ id: "ev-1", claim: "c" }], evidenceIds: ["ev-1"] });
    const parse = vi.fn()
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_evidence", input: { query: "K-pop" } }, { type: "tool_use", id: "t2", name: "get_strategy", input: {} }], parsed_output: null })
      .mockResolvedValueOnce(finalTurn);
    const out = await runCopilotAgent({ userId: "u", projectId: "p", context: "ctx", question: "q", client: { messages: { parse } } as never });

    expect(out.answer.answer).toBe("Grounded answer");
    expect(out.steps.map((s) => s.label)).toEqual(["Searched evidence for “K-pop”", "Read the strategy directions"]);
    expect([...out.seenEvidenceIds]).toEqual(["ev-1"]);
    const second = parse.mock.calls[1][0];
    const lastMsg = second.messages.at(-1);
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(["t1", "t2"]);
    expect(second.tool_choice).toEqual({ type: "auto" });
    expect(runTool).toHaveBeenCalledWith({}, "p", "search_evidence", { query: "K-pop" });
  });

  it("stops offering tools on the last step so the model must answer", async () => {
    runTool.mockResolvedValue({ result: [], evidenceIds: [] });
    const parse = vi.fn();
    for (let i = 0; i < 5; i++) parse.mockResolvedValueOnce(toolTurn(`t${i}`, "list_experiments", {}));
    parse.mockResolvedValueOnce(finalTurn);
    await runCopilotAgent({ userId: "u", projectId: "p", context: "c", question: "q", client: { messages: { parse } } as never });
    expect(parse).toHaveBeenCalledTimes(6);
    expect(parse.mock.calls[5][0].tool_choice).toEqual({ type: "none" });
  });

  it("reports a refusal instead of saving anything", async () => {
    const parse = vi.fn().mockResolvedValueOnce({ stop_reason: "refusal", content: [], parsed_output: null });
    await expect(runCopilotAgent({ userId: "u", projectId: "p", context: "c", question: "q", client: { messages: { parse } } as never })).rejects.toMatchObject({ code: "refusal" });
  });

  it("offers live Qloo tools only with a session, runs them outside the database and keeps only real refs", async () => {
    const insights = vi.fn().mockResolvedValue({ data: [{ providerId: "x", name: "Mitski", type: "artist", affinity: 0.912, popularity: 0.5, tags: [], description: null, disambiguation: null, explainability: [{ entityId: "s1", score: 0.8 }] }] });
    const session = new QlooSession({
      search: vi.fn().mockResolvedValue({ data: [{ providerId: "s1", name: "Glossier", type: "brand", affinity: null, popularity: 0.7, tags: [], description: null, disambiguation: null, explainability: [] }] }),
      searchTags: vi.fn(), insights, tagInsights: vi.fn(),
    } as never);
    const parse = vi.fn()
      .mockResolvedValueOnce(toolTurn("t1", "qloo_taste", { audience: { likes: ["Glossier"] }, find: "artist" }))
      .mockResolvedValueOnce({ ...finalTurn, parsed_output: { ...answer, qlooRefs: ["Q1", "Q9"] } });
    const out = await runCopilotAgent({ userId: "u", projectId: "p", context: "c", question: "q", qloo: session, client: { messages: { parse } } as never });

    expect(parse.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).toContain("qloo_taste");
    expect(runTool).not.toHaveBeenCalled();
    expect(out.steps).toEqual([{ label: "Asked Qloo which music artists fans of Glossier like", ok: true }]);
    expect(out.qloo).toEqual([{ ref: "Q1", name: "Mitski", type: "artist", affinity: 0.91, asked: "music artists for fans of Glossier" }]);
  });

  it("doesn't offer Qloo tools without a session", async () => {
    const parse = vi.fn().mockResolvedValueOnce(finalTurn);
    const out = await runCopilotAgent({ userId: "u", projectId: "p", context: "c", question: "q", client: { messages: { parse } } as never });
    expect(parse.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).not.toContain("qloo_taste");
    expect(out.qloo).toEqual([]);
  });
});
