/**
 * Reads ad-platform exports (Meta Ads Manager, Google Ads, TikTok Ads, or any spreadsheet with
 * similar columns) into per-variant successes and exposures. Rows are matched to the experiment's
 * variants by name; anything unmatched is reported, never guessed.
 */
export type CsvImport = {
  rows: { variant: string; label: string; successes: number; exposures: number }[];
  unmatched: string[];
  columns: { name: string; successes: string; exposures: string };
};

const NAME = ["variant", "ad set name", "ad name", "ad group name", "ad group", "campaign name", "campaign", "creative", "group"];
const EXPOSURES = ["exposures", "impressions", "impr.", "reach", "sessions", "visitors", "users", "sample size", "n"];
const SUCCESSES = ["successes", "conversions", "results", "purchases", "leads", "sign ups", "signups", "link clicks", "clicks", "conv."];

/** Splits CSV text into rows, handling quoted fields, escaped quotes, commas and semicolons as separators. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** "1,234" → 1234, "1 234" → 1234, "12.5%" is rejected (rates aren't counts). */
function count(v: string): number | null {
  const t = v.replace(/[\s,]/g, "");
  if (!/^\d+(\.0+)?$/.test(t)) return null;
  return Math.round(Number(t));
}

const findColumn = (header: string[], names: string[]) => {
  const h = header.map((x) => x.toLowerCase().replace(/\s+/g, " ").trim());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
};

export function importResults(text: string, variants: { id: string; label: string }[]): CsvImport | { error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "The file needs a header row and at least one data row." };
  const [header, ...data] = rows;
  const iName = findColumn(header, NAME);
  const iExp = findColumn(header, EXPOSURES);
  const iSucc = findColumn(header, SUCCESSES);
  if (iName < 0 || iExp < 0 || iSucc < 0) {
    return { error: `Couldn't find the columns. The file needs a name column (e.g. “Ad set name”, “Campaign”, “Variant”), an exposures column (e.g. “Impressions”) and a successes column (e.g. “Conversions”, “Results”, “Clicks”). Found: ${header.join(", ")}.` };
  }
  const byVariant = new Map<string, { variant: string; label: string; successes: number; exposures: number }>();
  const unmatched: string[] = [];
  for (const r of data) {
    const name = r[iName] ?? "";
    if (!name || /^(total|totals|grand total)/i.test(name)) continue;
    const exp = count(r[iExp] ?? "");
    const succ = count(r[iSucc] ?? "");
    const lower = name.toLowerCase();
    // Exact label first, then a label contained in the row name ("Variant B – Stories" → "Variant B").
    const v = variants.find((x) => x.label.toLowerCase() === lower) ?? variants.find((x) => lower.includes(x.label.toLowerCase()));
    if (!v || exp === null || succ === null) { unmatched.push(name); continue; }
    const agg = byVariant.get(v.id) ?? { variant: v.id, label: v.label, successes: 0, exposures: 0 };
    agg.successes += succ;
    agg.exposures += exp;
    byVariant.set(v.id, agg);
  }
  const out = [...byVariant.values()];
  if (out.some((a) => a.successes > a.exposures)) return { error: "Some rows have more successes than exposures. Check that the successes and exposures columns aren't swapped." };
  return { rows: out, unmatched, columns: { name: header[iName], successes: header[iSucc], exposures: header[iExp] } };
}
