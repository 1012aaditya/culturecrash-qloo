"use client";

import Link from "next/link";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import { askCopilotAction, type CopilotMessage } from "@/lib/ai/copilot-actions";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Summarize the campaign research",
  "Explain the evidence behind the top findings",
  "Explore adjacent cultural opportunities",
  "What assumptions should we test?",
  "Find contradictory evidence",
  "Compare these positioning directions",
];

const actionHref = (projectId: string, type: string) =>
  type === "create_experiment" ? `/projects/${projectId}/experiments?new=1` : type === "generate_report" ? `/projects/${projectId}/reports?new=1` : `/projects/${projectId}/opportunities?generate=1`;

export function CopilotPanel({
  projectId, initial, conversationId: initialConversation, llm, compact = false,
}: {
  projectId: string; initial: CopilotMessage[]; conversationId: string | null; llm: boolean; compact?: boolean;
}) {
  const [messages, setMessages] = React.useState<CopilotMessage[]>(initial);
  const [conversationId, setConversationId] = React.useState(initialConversation);
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function ask(q: string) {
    const question = q.trim();
    if (question.length < 2 || pending) return;
    setPending(true);
    setError(null);
    setValue("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: question, generator: null, cited: [], action: null, steps: [], createdAt: new Date().toISOString() }]);
    const res = await askCopilotAction({ projectId, conversationId, question });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConversationId(res.conversationId);
    setMessages((m) => [...m, res.message]);
  }

  return (
    <section aria-label="Ask CultureCrash" className="flex min-h-0 flex-col rounded-cc-lg border border-line bg-paper p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-ink text-white"><Sparkles className="size-4" /></span>
        <div>
          <h2 className="text-[14px] font-semibold">Ask CultureCrash</h2>
          <p className="text-[12px] text-muted">{llm ? "Looks up this project’s evidence, entities, strategy and experiments before answering." : "No LLM configured — answers come from stored records only."}</p>
        </div>
      </div>

      {messages.length > 0 && (
        <div ref={listRef} className={cn("mt-3 space-y-3 overflow-y-auto pr-1", compact ? "max-h-56" : "max-h-[420px]")} aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={cn("rounded-cc-sm px-3 py-2 text-[13px] leading-relaxed", m.role === "user" ? "ml-8 bg-ink text-white" : "mr-4 bg-ivory")}>
              {m.role === "assistant" && m.steps.length > 0 && (
                <details className="mb-1.5 text-[11px] text-muted">
                  <summary className="cursor-pointer select-none">{m.steps.length} lookup{m.steps.length === 1 ? "" : "s"} before answering</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    {m.steps.map((s, i) => <li key={i} className={cn(!s.ok && "text-danger")}>{s.label}{s.ok ? "" : " (no result)"}</li>)}
                  </ol>
                </details>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "assistant" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>{m.generator === "template-engine" ? "Template answer" : m.generator ? `AI · ${m.generator.replace("llm:", "")}` : ""}</span>
                  {m.cited.slice(0, 4).map((id, i) => (
                    <Link key={id} href={`/projects/${projectId}/evidence/${id}`} className="rounded-full bg-paper px-2 py-0.5 text-violet hover:underline">Evidence {i + 1}</Link>
                  ))}
                  {m.action && (
                    <Link href={actionHref(projectId, m.action.type)} className="rounded-full bg-violet px-2.5 py-0.5 text-white">{m.action.label || "Open"} →</Link>
                  )}
                </div>
              )}
            </div>
          ))}
          {pending && <p className="flex items-center gap-2 text-[12px] text-muted"><Loader2 className="size-3.5 animate-spin" /> {llm ? "Looking things up in this project…" : "Reading project evidence…"}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.slice(0, compact ? 4 : 6).map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={pending} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink/80 transition-colors hover:border-violet/40 hover:bg-lilac/40 disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(value); }} className="mt-3 flex items-center gap-2 rounded-full border border-line bg-ivory/60 py-1.5 pl-4 pr-1.5 focus-within:border-violet">
        <label htmlFor={`copilot-${projectId}`} className="sr-only">Ask a question</label>
        <input id={`copilot-${projectId}`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} placeholder="Ask a question or give a command…" className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        <button type="submit" disabled={pending || value.trim().length < 2} className="flex size-8 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40" aria-label="Send">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </section>
  );
}
