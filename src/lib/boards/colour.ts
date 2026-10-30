/** Palette helpers: plain-English colour names and WCAG 2.x contrast ratios. Pure functions, no dependencies. */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (sRGB). */
export function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** WCAG level for text: AA needs 4.5 (3 for large text), AAA needs 7. */
export function contrastLevel(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fail";
}

/** A small vocabulary of colour names a brand team would use; the nearest one (in RGB) names a swatch. */
const NAMES: [string, string][] = [
  ["Ink black", "#111116"], ["Charcoal", "#36454f"], ["Slate", "#6b7280"], ["Stone grey", "#a8a29e"], ["Mist", "#e5e7eb"], ["Ivory", "#f7f5f2"], ["White", "#ffffff"],
  ["Sand", "#e7d3b0"], ["Camel", "#c19a6b"], ["Tan", "#d2b48c"], ["Terracotta", "#c8553d"], ["Rust", "#a0522d"], ["Chocolate", "#5b3a29"], ["Espresso", "#3b2a20"],
  ["Peach", "#ffc7b1"], ["Coral", "#f29a8b"], ["Blush", "#f4c2c2"], ["Rose", "#e7849b"], ["Raspberry", "#c2185b"], ["Crimson", "#b91c1c"], ["Burgundy", "#6d1a36"],
  ["Saffron", "#f4a300"], ["Marigold", "#eaa221"], ["Mustard", "#d4a017"], ["Butter", "#f8e9a1"], ["Lemon", "#fde047"],
  ["Sage", "#9caf88"], ["Olive", "#708238"], ["Moss", "#5f7a3a"], ["Emerald", "#10b981"], ["Forest", "#1f4d3a"], ["Mint", "#c7f0d8"], ["Teal", "#0f766e"],
  ["Sky", "#7dd3fc"], ["Cornflower", "#6495ed"], ["Cobalt", "#1d4ed8"], ["Navy", "#1e2a4a"], ["Midnight", "#191970"],
  ["Lilac", "#e8dfff"], ["Lavender", "#b8a5ff"], ["Violet", "#8064f5"], ["Indigo", "#4b2fa8"], ["Plum", "#5e2750"], ["Mauve", "#c4a4c4"],
];

export function colourName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let best = NAMES[0][0];
  let bestD = Infinity;
  for (const [name, h] of NAMES) {
    const c = hexToRgb(h)!;
    // Weighted RGB distance ("redmean"): cheap and close to perceived difference.
    const rm = (rgb[0] + c[0]) / 2;
    const d = (2 + rm / 256) * (rgb[0] - c[0]) ** 2 + 4 * (rgb[1] - c[1]) ** 2 + (2 + (255 - rm) / 256) * (rgb[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

/** Text/background pairs from the palette (plus black and white) that pass WCAG AA, best first. */
export function readablePairs(palette: string[]) {
  const all = [...new Set([...palette.map((c) => c.toLowerCase()), "#ffffff", "#111116"])];
  const pairs: { text: string; background: string; ratio: number; level: ReturnType<typeof contrastLevel> }[] = [];
  for (const bg of palette) {
    for (const fg of all) {
      if (fg === bg.toLowerCase()) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio >= 4.5) pairs.push({ text: fg, background: bg.toLowerCase(), ratio, level: contrastLevel(ratio) });
    }
  }
  return pairs.sort((a, b) => b.ratio - a.ratio);
}
