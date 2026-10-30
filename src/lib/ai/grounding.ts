/**
 * Statement-level grounding. Every factual statement the model writes carries the evidence ids it
 * rests on, and this check reads the cited evidence text to see whether it actually backs the
 * statement. It is deliberately conservative and deterministic (no second model call):
 *  - verified: every number and proper name in the statement appears in the cited evidence, and
 *    the statement shares content words with it;
 *  - weak: it cites real evidence, but the evidence doesn't contain what the statement says;
 *  - uncited: no stored evidence id was given, so the statement is AI interpretation.
 */
export type Support = "verified" | "weak" | "uncited";
export type CitedStatement = { statement: string; evidenceIds: string[]; support?: Support };
export type GroundedStatement = { statement: string; evidenceIds: string[]; support: Support };

const STOP = new Set(
  ("a an and are as at be been but by can could does for from had has have how in into is it its may might more most not of on or our over should " +
    "such than that the their them then there these they this those through to under up was were what when where which while who why will with within " +
    "would your you we us also both each every many much other only same some very about across after against among around because before between " +
    "during first however just like make made new now own per so still than very via yet audience audiences brand brands direction evidence " +
    "data shows show suggests suggest signal signals qloo affinity january february march april may june july august september october november december")
    .split(" "),
);

const NUMBER = /\d+(?:[.,]\d+)?/g;
const toNumber = (s: string) => Number(s.replace(",", "."));

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(toNumber).filter((n) => Number.isFinite(n));
}

/** Capitalised words that aren't just starting a sentence: names of brands, artists, places, scenes. */
function namesIn(statement: string): string[] {
  const out: string[] = [];
  const re = /[A-Z][\p{L}\p{N}'’&-]{2,}/gu;
  for (const m of statement.matchAll(re)) {
    const before = statement.slice(0, m.index).trimEnd();
    if (!before || /[.!?:;—–"“(]$/.test(before)) continue;
    const word = m[0].replace(/['’]s$/, "");
    if (!STOP.has(word.toLowerCase())) out.push(word.toLowerCase());
  }
  return [...new Set(out)];
}

function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}[\p{L}\p{N}'’-]{3,}/gu) ?? []).filter((w) => !STOP.has(w)));
}

/** 0.91 and 91% describe the same value, so either spelling counts as present. */
function numberPresent(n: number, haystack: number[]) {
  return haystack.some((h) => Math.abs(h - n) < 1e-9 || Math.abs(h * 100 - n) < 0.51 || Math.abs(h - n * 100) < 0.51);
}

export function checkStatement(s: CitedStatement, evidence: Map<string, string>): GroundedStatement {
  const ids = [...new Set(s.evidenceIds.filter((id) => evidence.has(id)))];
  const statement = s.statement.trim();
  if (!ids.length) return { statement, evidenceIds: [], support: "uncited" };
  const cited = ids.map((id) => evidence.get(id)!).join("\n");
  const hay = cited.toLowerCase();
  const hayNumbers = numbersIn(cited);
  const numbersOk = numbersIn(statement).every((n) => numberPresent(n, hayNumbers));
  const names = namesIn(statement);
  const namesOk = names.every((n) => hay.includes(n));
  const shared = [...contentWords(statement)].filter((w) => contentWords(cited).has(w)).length;
  const verified = numbersOk && namesOk && (shared >= 2 || (names.length > 0 && shared >= 1));
  return { statement, evidenceIds: ids, support: verified ? "verified" : "weak" };
}

export function checkStatements(list: CitedStatement[] | undefined, evidence: Map<string, string>): GroundedStatement[] {
  return (list ?? []).filter((s) => s.statement?.trim()).map((s) => checkStatement(s, evidence));
}

/** Share of statements whose citations were verified; null when there are no statements to score. */
export function groundingScore(list: { support?: Support }[] | undefined): { verified: number; total: number } | null {
  if (!list?.length) return null;
  return { verified: list.filter((s) => s.support === "verified").length, total: list.length };
}

/** Evidence ids a set of statements actually leans on (verified or weak; uncited ones have none). */
export function citedIds(list: { evidenceIds: string[] }[] | undefined): string[] {
  return [...new Set((list ?? []).flatMap((s) => s.evidenceIds))];
}
