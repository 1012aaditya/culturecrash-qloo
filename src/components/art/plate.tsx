import { cn, hashString } from "@/lib/utils";

/**
 * Generative editorial "photography plates". Stable, local, license-free imagery
 * that follows the campaign's category. Decorative only: never used to represent data.
 */
export type PlateTheme =
  | "beauty" | "music" | "fashion" | "travel" | "food" | "sustainability" | "architecture" | "culture" | "youth";

const palettes: Record<PlateTheme, [string, string, string, string]> = {
  beauty: ["#2a2233", "#8064F5", "#FFC7B1", "#E8DFFF"],
  music: ["#120f1c", "#5b3fd6", "#F29A8B", "#ffb36b"],
  fashion: ["#1b1820", "#3b3346", "#B8A5FF", "#f3e9e1"],
  travel: ["#1f2a3a", "#6f8fb3", "#FFC7B1", "#e9eef2"],
  food: ["#2a2420", "#7b6a58", "#F29A8B", "#efe3d3"],
  sustainability: ["#162119", "#3f6b4a", "#cfe3b0", "#f2eedf"],
  architecture: ["#2c2730", "#c9b8ad", "#FFC7B1", "#f6efe9"],
  culture: ["#17151E", "#8064F5", "#FFC7B1", "#B8A5FF"],
  youth: ["#1d1530", "#8064F5", "#ff9fb8", "#ffe1a8"],
};

export function themeForCategory(category: string | null | undefined): PlateTheme {
  const c = (category ?? "").toLowerCase();
  if (/(skin|beauty|cosmetic|makeup|fragrance|hair)/.test(c)) return "beauty";
  if (/(music|audio|festival|entertain|concert)/.test(c)) return "music";
  if (/(fashion|apparel|cloth|footwear|luxury)/.test(c)) return "fashion";
  if (/(travel|hotel|hospitality|tourism|airline)/.test(c)) return "travel";
  if (/(food|beverage|drink|restaurant|coffee|snack|tea)/.test(c)) return "food";
  if (/(sustain|eco|outdoor|nature|green)/.test(c)) return "sustainability";
  if (/(design|architecture|home|furniture|interior)/.test(c)) return "architecture";
  if (/(youth|gen z|gaming|sport|street)/.test(c)) return "youth";
  return "culture";
}

function rand(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function ArtPlate({
  theme = "culture",
  seed = "cc",
  className,
  rounded = true,
  label,
}: {
  theme?: PlateTheme;
  seed?: string;
  className?: string;
  rounded?: boolean;
  label?: string;
}) {
  const r = rand(hashString(`${theme}:${seed}`));
  const [deep, mid, warm, light] = palettes[theme];
  const id = `p${hashString(`${theme}-${seed}`).toString(36)}`;
  const tilt = Math.round(r() * 40 - 20);
  return (
    <div
      className={cn("cc-grain relative isolate overflow-hidden", rounded && "rounded-cc", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg className="absolute inset-0 size-full" viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.3" y2="1" gradientTransform={`rotate(${tilt} .5 .5)`}>
            <stop offset="0" stopColor={mid} />
            <stop offset="0.55" stopColor={deep} />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx={0.3 + r() * 0.4} cy={0.25 + r() * 0.3} r="0.7">
            <stop offset="0" stopColor={warm} stopOpacity="0.95" />
            <stop offset="0.45" stopColor={warm} stopOpacity="0.25" />
            <stop offset="1" stopColor={warm} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-fig`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} stopOpacity="0.95" />
            <stop offset="0.5" stopColor={warm} stopOpacity="0.55" />
            <stop offset="1" stopColor={deep} stopOpacity="0.9" />
          </linearGradient>
          <filter id={`${id}-blur`}><feGaussianBlur stdDeviation="6" /></filter>
          <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>
        <rect width="200" height="260" fill={`url(#${id}-bg)`} />
        <rect width="200" height="260" fill={`url(#${id}-glow)`} />
        <Motif theme={theme} id={id} seed={hashString(`motif:${theme}:${seed}`)} colors={{ deep, mid, warm, light }} />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
    </div>
  );
}

type C = { deep: string; mid: string; warm: string; light: string };

function Motif({ theme, id, seed, colors }: { theme: PlateTheme; id: string; seed: number; colors: C }) {
  // Pure: a fresh generator per render, so repeated renders produce identical output.
  const r = rand(seed);
  switch (theme) {
    case "beauty":
    case "youth":
      return (
        <g>
          <ellipse cx="150" cy="70" rx="80" ry="95" fill={colors.deep} opacity="0.75" filter={`url(#${id}-blur)`} />
          <path
            d="M128 24 C92 22 70 48 70 84 C70 99 64 108 57 118 C53 125 55 130 61 132 C59 138 60 142 65 144 C62 150 65 156 71 158 C69 172 76 182 92 181 C104 181 110 188 112 200 L114 260 L200 260 L200 74 C194 44 166 26 128 24 Z"
            fill={`url(#${id}-fig)`}
          />
          <path d="M126 22 C170 18 206 52 204 104 C202 150 182 160 186 210 L200 260 L200 0 L130 0 Z" fill={colors.deep} opacity="0.85" />
          <path d="M60 132 C66 131 70 134 72 137" stroke={colors.deep} strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
          <ellipse cx="96" cy="96" rx="10" ry="4" fill={colors.light} opacity="0.35" filter={`url(#${id}-soft)`} />
        </g>
      );
    case "music": {
      const beams = Array.from({ length: 4 }, (_, i) => 30 + i * 45 + r() * 20);
      return (
        <g>
          {beams.map((x, i) => (
            <polygon key={i} points={`${x},0 ${x - 40},260 ${x + 40},260`} fill={i % 2 ? colors.warm : colors.light} opacity="0.12" />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={r() * 200} cy={30 + r() * 120} r={1 + r() * 4} fill={colors.warm} opacity={0.3 + r() * 0.6} filter={`url(#${id}-soft)`} />
          ))}
          <path
            d={`M0 260 L0 ${200 + r() * 10} ${Array.from({ length: 12 }, (_, i) => {
              const x = i * 18 + 8;
              const h = 180 + r() * 30;
              return `Q ${x} ${h - 22} ${x + 9} ${h} `;
            }).join("")} L200 205 L200 260 Z`}
            fill={colors.deep}
          />
          <path d="M70 200 L64 150 M120 205 L130 150" stroke={colors.deep} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    }
    case "travel":
      return (
        <g>
          <circle cx={60 + r() * 60} cy="80" r="22" fill={colors.warm} opacity="0.85" filter={`url(#${id}-soft)`} />
          <rect y="160" width="200" height="100" fill={colors.mid} opacity="0.55" />
          <path d="M0 165 Q50 160 100 166 T200 164 L200 172 Q100 176 0 172 Z" fill={colors.light} opacity="0.35" />
          <path d="M110 260 L118 150 Q130 110 150 100 Q170 96 178 120 L200 140 L200 260 Z" fill={colors.deep} />
          <path d="M150 100 Q160 120 156 150" stroke={colors.light} strokeOpacity="0.2" fill="none" />
        </g>
      );
    case "food":
      return (
        <g>
          <circle cx="100" cy="135" r="78" fill={colors.light} opacity="0.92" />
          <circle cx="100" cy="135" r="60" fill={colors.mid} opacity="0.45" />
          <circle cx="100" cy="135" r="46" fill="#6f8a4b" opacity="0.85" />
          <ellipse cx="88" cy="122" rx="16" ry="8" fill={colors.light} opacity="0.4" filter={`url(#${id}-soft)`} />
          <path d="M120 40 L190 95 M130 32 L196 82" stroke={colors.deep} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "sustainability":
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const x = 20 + i * 20 + r() * 10;
            const top = 30 + r() * 80;
            const bend = (r() - 0.5) * 90;
            return (
              <path
                key={i}
                d={`M${x} 260 Q ${x + bend / 2} ${(top + 260) / 2} ${x + bend} ${top} Q ${x + bend / 2 + 8} ${(top + 260) / 2} ${x + 10} 260 Z`}
                fill={i % 3 === 0 ? colors.light : colors.mid}
                opacity={0.55 + r() * 0.4}
              />
            );
          })}
        </g>
      );
    case "fashion":
      return (
        <g>
          <path d="M40 260 L40 120 Q40 40 100 40 Q160 40 160 120 L160 260 Z" fill={colors.light} opacity="0.12" />
          <circle cx="102" cy="70" r="16" fill={`url(#${id}-fig)`} />
          <path d="M80 92 Q102 84 124 92 L140 200 Q102 214 64 200 Z" fill={colors.deep} />
          <path d="M84 200 L86 260 M118 200 L116 260" stroke={colors.deep} strokeWidth="10" />
          <path d="M80 92 Q70 140 62 180" stroke={colors.warm} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
        </g>
      );
    case "architecture":
      return (
        <g>
          <circle cx="70" cy="170" r="30" fill={colors.mid} />
          <ellipse cx="70" cy="200" rx="34" ry="6" fill={colors.deep} opacity="0.25" />
          <polygon points="120,90 150,200 90,200" fill={colors.light} />
          <polygon points="120,90 150,200 128,200" fill={colors.mid} opacity="0.6" />
          <rect x="150" y="140" width="20" height="60" rx="10" fill={colors.warm} opacity="0.9" />
          <rect y="200" width="200" height="60" fill={colors.light} opacity="0.65" />
        </g>
      );
    default:
      return (
        <g>
          <circle cx={60 + r() * 80} cy={90 + r() * 60} r="60" fill={colors.mid} opacity="0.6" filter={`url(#${id}-blur)`} />
          <circle cx={80 + r() * 60} cy={120 + r() * 40} r="40" fill={colors.light} opacity="0.55" filter={`url(#${id}-blur)`} />
          <path d="M0 200 C60 160 120 240 200 180" stroke={colors.light} strokeOpacity="0.5" fill="none" />
          <path d="M0 214 C60 174 120 254 200 194" stroke={colors.light} strokeOpacity="0.25" fill="none" />
        </g>
      );
  }
}
