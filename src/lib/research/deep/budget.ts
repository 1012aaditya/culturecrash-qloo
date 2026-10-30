import type { Depth } from "./types";

/** Per-depth limits. All are configurable; none promises a number of sources. */
export type BudgetLimits = {
  maxProviderCalls: number;
  maxRounds: number;          // initial discovery + follow-ups
  maxRetrievedPages: number;  // full-page fetches (not every hit)
  maxDocsToModel: number;     // documents sent to claim extraction
  maxUsd: number;             // estimated spend ceiling for the job
  maxSeconds: number;
  maxLlmCalls: number;
  synthesisReserveUsd: number;
};

export const DEPTH_PROFILES: Record<Depth, BudgetLimits> = {
  quick: { maxProviderCalls: 6, maxRounds: 1, maxRetrievedPages: 3, maxDocsToModel: 8, maxUsd: 0.15, maxSeconds: 75, maxLlmCalls: 3, synthesisReserveUsd: 0.05 },
  // Reserves cover a typical synthesis with the default main model (see synthesisEstimateUsd).
  standard: { maxProviderCalls: 16, maxRounds: 2, maxRetrievedPages: 8, maxDocsToModel: 18, maxUsd: 0.6, maxSeconds: 170, maxLlmCalls: 6, synthesisReserveUsd: 0.25 },
  deep: { maxProviderCalls: 32, maxRounds: 3, maxRetrievedPages: 16, maxDocsToModel: 32, maxUsd: 1.5, maxSeconds: 270, maxLlmCalls: 10, synthesisReserveUsd: 0.35 },
};

export type Usage = {
  providerCalls: number;
  failedCalls: number;
  retrievedPages: number;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  usdEstimated: number;
  usdActual: number;   // only provider-reported charges
  rounds: number;
  byProvider: Record<string, { calls: number; failed: number; units: number; usd: number; ms: number }>;
};

export function emptyUsage(): Usage {
  return { providerCalls: 0, failedCalls: 0, retrievedPages: 0, llmCalls: 0, tokensIn: 0, tokensOut: 0, usdEstimated: 0, usdActual: 0, rounds: 0, byProvider: {} };
}

export class Budget {
  readonly usage: Usage = emptyUsage();
  private readonly started: number;
  constructor(readonly limits: BudgetLimits, private readonly monthlyHeadroomUsd = Infinity, private readonly now = () => Date.now()) {
    this.started = now();
  }

  elapsedSeconds() { return (this.now() - this.started) / 1000; }
  private ceiling() { return Math.min(this.limits.maxUsd, this.monthlyHeadroomUsd); }

  /** Can an optional operation run without eating the synthesis reserve? */
  canSpend(kind: "provider" | "page" | "llm", estimatedUsd: number): { ok: boolean; reason?: string } {
    if (this.elapsedSeconds() > this.limits.maxSeconds * 0.8) return { ok: false, reason: "time_limit" };
    if (kind === "provider" && this.usage.providerCalls >= this.limits.maxProviderCalls) return { ok: false, reason: "provider_call_limit" };
    if (kind === "page" && this.usage.retrievedPages >= this.limits.maxRetrievedPages) return { ok: false, reason: "page_limit" };
    if (kind === "llm" && this.usage.llmCalls >= this.limits.maxLlmCalls - 1) return { ok: false, reason: "llm_call_limit" };
    if (this.usage.usdEstimated + estimatedUsd > this.ceiling() - this.limits.synthesisReserveUsd) return { ok: false, reason: "budget_limit" };
    return { ok: true };
  }

  /** Synthesis may use the reserve, but never exceed the ceiling. */
  canSynthesize(estimatedUsd: number) {
    return this.usage.llmCalls < this.limits.maxLlmCalls && this.usage.usdEstimated + estimatedUsd <= this.ceiling();
  }

  record(provider: string, r: { ok: boolean; units: number; usdEstimated: number; usdActual: number | null; ms: number; kind?: "provider" | "page" | "llm" | "cache"; tokensIn?: number; tokensOut?: number }) {
    const u = this.usage;
    if (r.kind === "page") u.retrievedPages++;
    else if (r.kind === "llm") { u.llmCalls++; u.tokensIn += r.tokensIn ?? 0; u.tokensOut += r.tokensOut ?? 0; }
    // A cache hit costs nothing and calls nobody, so it doesn't use up the provider-call allowance.
    else if (r.kind !== "cache") u.providerCalls++;
    if (!r.ok) u.failedCalls++;
    u.usdEstimated = Math.round((u.usdEstimated + r.usdEstimated) * 1e6) / 1e6;
    if (r.usdActual !== null) u.usdActual = Math.round((u.usdActual + r.usdActual) * 1e6) / 1e6;
    const p = (u.byProvider[provider] ??= { calls: 0, failed: 0, units: 0, usd: 0, ms: 0 });
    p.calls++;
    if (!r.ok) p.failed++;
    p.units += r.units;
    p.usd = Math.round((p.usd + r.usdEstimated) * 1e6) / 1e6;
    p.ms += r.ms;
  }
}

/** Estimated LLM cost from token counts; prices are configurable per model (USD per million tokens). */
export function llmCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price: Record<string, [number, number]> = {
    "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5],
  };
  const [pi, po] = price[model] ?? [4, 20];
  return (tokensIn * pi + tokensOut * po) / 1_000_000;
}

/** Typical tokens for one research synthesis per depth (prompt with claims in, structured report out). */
const SYNTHESIS_TOKENS: Record<"quick" | "standard" | "deep", [number, number]> = { quick: [8_000, 3_000], standard: [20_000, 8_000], deep: [30_000, 10_000] };

/** Estimated cost of the synthesis call, so the budget check reflects the model actually used. */
export function synthesisEstimateUsd(model: string, depth: "quick" | "standard" | "deep"): number {
  const [tokensIn, tokensOut] = SYNTHESIS_TOKENS[depth];
  return llmCostUsd(model, tokensIn, tokensOut);
}
