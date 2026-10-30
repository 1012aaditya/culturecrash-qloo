/**
 * Comparing conversion-style results (successes out of exposures) between a control and a variant.
 * A two-sided two-proportion z-test with a 95% confidence interval on the difference — simple,
 * standard and explainable in a client meeting. It refuses to call a result when the sample is
 * too small for the normal approximation.
 */
export type Arm = { label: string; successes: number; exposures: number };

export type Comparison = {
  variant: string;
  control: string;
  controlRate: number;
  variantRate: number;
  /** Variant minus control, in rate points (0.012 = +1.2 points). */
  difference: number;
  /** Relative change versus control (0.15 = +15%); null when the control rate is 0. */
  lift: number | null;
  ci95: [number, number];
  pValue: number;
  verdict: "variant_better" | "variant_worse" | "no_clear_difference" | "too_little_data";
  /** Why the verdict is what it is, in plain words. */
  reason: string;
};

/** Minimum per arm before a comparison is called at all. */
export const MIN_EXPOSURES = 100;
const MIN_EXPECTED = 10;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function compareArms(control: Arm, variant: Arm, alpha = 0.05): Comparison {
  const p1 = control.exposures ? control.successes / control.exposures : 0;
  const p2 = variant.exposures ? variant.successes / variant.exposures : 0;
  const base = { variant: variant.label, control: control.label, controlRate: p1, variantRate: p2, difference: p2 - p1, lift: p1 > 0 ? (p2 - p1) / p1 : null };
  const small = [control, variant].find((a) => a.exposures < MIN_EXPOSURES || a.successes < MIN_EXPECTED || a.exposures - a.successes < MIN_EXPECTED);
  const se = Math.sqrt((p1 * (1 - p1)) / Math.max(1, control.exposures) + (p2 * (1 - p2)) / Math.max(1, variant.exposures));
  const ci95: [number, number] = [p2 - p1 - 1.96 * se, p2 - p1 + 1.96 * se];
  if (small) {
    return { ...base, ci95, pValue: NaN, verdict: "too_little_data",
      reason: `Not enough data in “${small.label}” yet: each group needs at least ${MIN_EXPOSURES} exposures and ${MIN_EXPECTED} successes and failures before a difference can be judged.` };
  }
  const pooled = (control.successes + variant.successes) / (control.exposures + variant.exposures);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / control.exposures + 1 / variant.exposures));
  const z = sePooled > 0 ? (p2 - p1) / sePooled : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const significant = pValue < alpha;
  const verdict = !significant ? "no_clear_difference" : p2 > p1 ? "variant_better" : "variant_worse";
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const pText = pValue < 0.001 ? "p < 0.001" : `p = ${pValue.toFixed(3)}`;
  const reason = significant
    ? `“${variant.label}” converted at ${pct(p2)} vs ${pct(p1)} for “${control.label}”. A difference this large would happen by chance less than ${Math.max(1, Math.ceil(pValue * 100))}% of the time (${pText}).`
    : `“${variant.label}” converted at ${pct(p2)} vs ${pct(p1)}. The gap is within what chance alone could produce (${pText}); keep the test running or treat the variants as equivalent.`;
  return { ...base, ci95, pValue, verdict, reason };
}
