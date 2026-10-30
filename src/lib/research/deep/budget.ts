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
  standard: { maxProviderCalls: 16, maxRounds: 2, maxRetrievedPages: 8, maxDocsToModel: 18, maxUsd: 0.6, maxSeconds: 170, maxLlmCalls: 6, synthesisReserveUsd: 0.15 },
  deep: { maxProviderCalls: 32, maxRounds: 3, maxRetrievedPages: 16, maxDocsToModel: 32, maxUsd: 1.5, maxSeconds: 270, maxLlmCalls: 10, synthesisReserveUsd: 0.3 },
};

/** Share of maxSeconds that external sources always get after the Qloo stage, however long it took. */
export const WEB_TIME_SHARE = 0.5;

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

  elapsedSeconds() { return (this.now() - this.started - this.grantedMs) / 1000; }

  private grantedMs = 0;
  /**
   * Guarantees at least `seconds` of working time from now (before the 80% stop threshold), so a slow
   * earlier stage (the Qloo stage) cannot use up the whole budget before any external source is searched.
   */
  ensureSecondsLeft(seconds: number) {
    const left = this.limits.maxSeconds * 0.8 - this.elapsedSeconds();
    if (seconds > 0 && left < seconds) this.grantedMs += (seconds - left) * 1000;
  }
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

  record(provider: string, r: { ok: boolean; units: number; usdEstimated: number; usdActual: number | null; ms: number; kind?: "provider" | "page" | "llm"; tokensIn?: number; tokensOut?: number }) {
    const u = this.usage;
    if (r.kind === "page") u.retrievedPages++;
    else if (r.kind === "llm") { u.llmCalls++; u.tokensIn += r.tokensIn ?? 0; u.tokensOut += r.tokensOut ?? 0; }
    else u.providerCalls++;
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
