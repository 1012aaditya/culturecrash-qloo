import "server-only";
import { z } from "zod";
import { generateStructured, tag } from "@/lib/ai";
import { withUser, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { llmCostUsd } from "@/lib/research/deep/budget";
import { platformHeadroomUsd } from "@/lib/research/spend";
import { lockWatch } from "./refine";

export const TOPICS = ["launch", "collaboration", "marketing", "financial", "leadership", "retail", "sustainability", "legal", "other"] as const;
export type Topic = (typeof TOPICS)[number];

const BATCH = 40;
/** Upper bound per run (about $0.08 with the fast model); the run's time limit usually stops it first. */
const MAX_PER_RUN = 2000;

const schema = z.object({
  stories: z.array(z.object({
    i: z.number().int(),
    about_company: z.boolean(),
    topic: z.enum(TOPICS),
    importance: z.number().int().min(1).max(5),
  })),
});

export type Story = { id: string; title: string; excerpt: string | null; publisher: string | null; company: string };

/** The prompt for one batch. Stories are untrusted text, wrapped in a tag and never followed as instructions. */
export function classifyPrompt(stories: Story[], companies: string[], industry: string | null): string {
  const lines = stories.map((s, i) => `[${i}] company: ${s.company} | publisher: ${s.publisher ?? "unknown"} | title: ${s.title}${s.excerpt ? ` | excerpt: ${s.excerpt.slice(0, 280)}` : ""}`);
  return `You label news items for a brand-monitoring dashboard that tracks these companies: ${companies.join(", ")}${industry ? ` (industry: ${industry})` : ""}.
For each item return:
- about_company: true when the named company (or its products, people, deals or reputation) is a real subject of the item — including partnerships, athlete deals, records, product reviews, shopping and "best of" articles about its products. False only when the name means something else (a person, horse, car, place), the company is merely mentioned in passing in a story about something else, or the item is a single resale/marketplace listing or unrelated fan content. When unsure, answer true and give it a low importance.
- topic: launch (new product, release, drop), collaboration (collab, partnership, co-branding), marketing (campaign, ad, sponsorship, athlete or ambassador deal), financial (results, guidance, shares, analysts, investment), leadership (executives, hiring, layoffs, organisation), retail (stores, distribution, pricing, e-commerce), sustainability, legal (lawsuits, regulation, controversy), or other.
- importance from 1 to 5: 5 = major company-level news (results, guidance, CEO change, acquisition, major lawsuit); 4 = significant campaign, partnership, athlete deal or launch; 3 = notable product release, collaboration or record; 2 = minor product news, reviews, colourways, routine share-price moves, analyst ratings and market round-ups; 1 = shopping deals, listicles, how-to, fan content.
Return exactly one entry per item, using its index as i.
${tag("stories", lines.join("\n"))}`;
}

/**
 * Labels the watch's stories that have no topic yet: relevance (off-topic ones are hidden, with the
 * reason), topic and importance. Runs as the user the watch runs as; each batch is checked against the
 * workspace research budget and the platform cap first, and recorded in the cost ledger. Does nothing
 * when no LLM is configured or the workspace has switched it off.
 */
export async function classifyWatch(ctx: { userId: string; ws: string; watchId: string; jobId: string; industry: string | null; deadline: number }): Promise<{ classified: number; hidden: number }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return { classified: 0, hidden: 0 };
  const { userId, ws, watchId, jobId } = ctx;
  const setup = await withUser(userId, async (tx) => {
    const [setting] = await tx`select enabled from integration_settings where workspace_id = ${ws} and provider = 'llm'`;
    const companies = (await tx`select name from watch_targets where watch_id = ${watchId} order by role, created_at`).map((t) => t.name as string);
    const pending = await tx`select d.id, d.title, d.excerpt, d.publisher, t.name as company from research_documents d join watch_targets t on t.id = d.watch_target_id
      where d.watch_id = ${watchId} and d.watch_topic is null and coalesce(d.watch_relevance, 'relevant') = 'relevant' and d.provider not in ('page')
      order by coalesce(d.published_at, d.retrieved_at) desc limit ${MAX_PER_RUN}`;
    return { enabled: setting ? Boolean(setting.enabled) : true, companies, pending: pending as unknown as Story[] };
  });
  if (!setup.enabled || !setup.pending.length) return { classified: 0, hidden: 0 };

  let classified = 0, hidden = 0;
  const estimate = llmCostUsd(e.LLM_MODEL_FAST, 6000, 2500);
  for (let i = 0; i < setup.pending.length && Date.now() < ctx.deadline; i += BATCH) {
    const batch = setup.pending.slice(i, i + BATCH);
    if (await withUser(userId, (tx) => overBudget(tx, ws, estimate))) break;
    // The platform cap needs its own connection, so it's checked outside the transaction above.
    const platform = await platformHeadroomUsd();
    if (platform !== null && platform < estimate) break;
    const started = Date.now();
    try {
      const out = await generateStructured({ schema, model: e.LLM_MODEL_FAST, effort: "low", maxTokens: 4000, prompt: classifyPrompt(batch, setup.companies, ctx.industry) });
      const usd = llmCostUsd(e.LLM_MODEL_FAST, out.usage.tokensIn, out.usage.tokensOut);
      await withUser(userId, async (tx) => {
        await lockWatch(tx, watchId);
        await ledger(tx, jobId, ws, "ok", Date.now() - started, null, usd, out.usage.tokensIn, out.usage.tokensOut, batch.length);
        for (const r of out.data.stories) {
          const s = batch[r.i];
          if (!s) continue;
          classified++;
          if (!r.about_company) hidden++;
          await tx`update research_documents set watch_topic = ${r.topic}, watch_importance = ${r.importance},
              watch_relevance = case when ${r.about_company}::boolean then coalesce(watch_relevance, 'relevant') else 'off_topic' end,
              watch_relevance_reason = case when ${r.about_company}::boolean then watch_relevance_reason else ${`Not really about ${s.company} (checked by AI).`} end
            where id = ${s.id}`;
        }
      });
    } catch (err) {
      await withUser(userId, (tx) => ledger(tx, jobId, ws, "error", Date.now() - started, err instanceof Error ? err.message.slice(0, 300) : "LLM error", 0, null, null, 0));
      break; // the rest are labelled on the next run
    }
  }
  return { classified, hidden };
}

async function overBudget(tx: Tx, ws: string, usd: number): Promise<boolean> {
  const [w] = await tx`select research_budget_usd_monthly as cap, public.research_spend_this_month(${ws}) as spent from workspaces where id = ${ws}`;
  return Number(w.spent) + usd > Number(w.cap);
}

async function ledger(tx: Tx, jobId: string, ws: string, status: "ok" | "error", ms: number, error: string | null, usd: number, tokensIn: number | null, tokensOut: number | null, count: number) {
  await tx`insert into research_sources (watch_job_id, workspace_id, provider, endpoint, params, status, result_count, duration_ms, error_message, units, cost_usd_estimated, tokens_in, tokens_out, cached, question_key)
    values (${jobId}, ${ws}, 'anthropic', 'messages:watch-classify', ${tx.json({ model: env().LLM_MODEL_FAST })}, ${status}, ${count}, ${ms}, ${error}, 1, ${usd}, ${tokensIn}, ${tokensOut}, false, 'watch:classify')`;
}
