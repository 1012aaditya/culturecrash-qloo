"use client";

import { LocateFixed, Minus, Plus } from "lucide-react";
import * as React from "react";
import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import type { EntityRow, RelRow } from "@/lib/data/research";
import { cn } from "@/lib/utils";

const W = 1000;
const H = 720;
const CX = W / 2;
const CY = H / 2 + 10;

export const TYPE_THEME: Record<string, PlateTheme> = {
  artist: "music", place: "travel", destination: "travel", brand: "beauty", tv_show: "culture", movie: "culture",
  podcast: "youth", book: "architecture", videogame: "youth", person: "fashion",
};

export const TYPE_LABEL: Record<string, string> = {
  brand: "Brands", artist: "Music", tv_show: "TV", movie: "Film", podcast: "Podcasts", place: "Places", destination: "Destinations",
  book: "Books", videogame: "Games", person: "People", tag: "Taste tags",
};

type Positioned = EntityRow & { x: number; y: number; card: boolean };

/**
 * Deterministic radial composition. Angular sector = entity type; distance from the
 * audience centre shrinks as affinity grows. Only returned entities and relations are drawn.
 */
export function layoutNetwork(entities: EntityRow[]): Positioned[] {
  const seeds = entities.filter((e) => e.role === "seed");
  const results = entities.filter((e) => e.role === "result");
  const tags = entities.filter((e) => e.role === "tag");
  const types = [...new Set(results.map((e) => e.type))];
  const out: Positioned[] = [];
  seeds.forEach((s, i) => {
    const a = -Math.PI / 2 + (i - (seeds.length - 1) / 2) * 0.55;
    out.push({ ...s, x: CX + Math.cos(a) * 120, y: CY + Math.sin(a) * 105, card: false });
  });
  const sector = (Math.PI * 2) / Math.max(types.length, 1);
  types.forEach((t, ti) => {
    const list = results.filter((e) => e.type === t).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
    const base = -Math.PI / 2 + sector * ti + sector / 2 + 0.35;
    list.forEach((e, i) => {
      const spread = list.length > 1 ? (i / (list.length - 1) - 0.5) * sector * 0.7 : 0;
      const aff = e.affinity ?? 0.4;
      const r = 200 + (1 - Math.max(0, Math.min(1, aff))) * 170 + (i % 2) * 34;
      const a = base + spread;
      out.push({ ...e, x: CX + Math.cos(a) * r * 1.25, y: CY + Math.sin(a) * r * 0.82, card: i === 0 });
    });
  });
  tags.forEach((e, i) => {
    const a = -Math.PI / 2 + (i / Math.max(tags.length, 1)) * Math.PI * 2 + 0.2;
    out.push({ ...e, x: CX + Math.cos(a) * 430, y: CY + Math.sin(a) * 315, card: false });
  });
  return out.map((p) => ({ ...p, x: Math.max(40, Math.min(W - 40, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) }));
}

export function CulturalNetwork({
  entities, relationships, selectedId, onSelect, typeFilter, query, audienceLabel, theme,
}: {
  entities: EntityRow[]; relationships: RelRow[]; selectedId: string | null; onSelect: (id: string | null) => void;
  typeFilter: Set<string>; query: string; audienceLabel: string; theme: PlateTheme;
}) {
  const nodes = React.useMemo(() => layoutNetwork(entities), [entities]);
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState(1);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth / W, el.clientHeight / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 40) return;
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.max(0.5, Math.min(2.6, v.k * (e.deltaY > 0 ? 0.9 : 1.1))) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const connected = React.useMemo(() => {
    if (!selectedId) return null;
    const s = new Set([selectedId]);
    relationships.forEach((r) => {
      if (r.from === selectedId) s.add(r.to);
      if (r.to === selectedId) s.add(r.from);
    });
    return s;
  }, [selectedId, relationships]);

  const q = query.trim().toLowerCase();
  const visible = (n: Positioned) => n.role === "seed" || typeFilter.size === 0 || typeFilter.has(n.role === "tag" ? "tag" : n.type);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const scale = fit * view.k;

  return (
    <div
      ref={box}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
      }}
      onPointerUp={() => (drag.current = null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center transition-transform duration-150 ease-out"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${scale})` }}
      >
        <svg width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="cc-edge" x1="0" x2="1">
              <stop offset="0" stopColor="#8064F5" stopOpacity="0.75" />
              <stop offset="1" stopColor="#B8A5FF" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {nodes.filter((n) => n.role !== "seed" && visible(n)).map((n, i) => {
            const mx = (CX + n.x) / 2 + (n.y - CY) * 0.18;
            const my = (CY + n.y) / 2 - (n.x - CX) * 0.18;
            const dim = connected && !connected.has(n.id) && selectedId !== null;
            const aff = n.affinity ?? 0.3;
            return (
              <path
                key={n.id}
                d={`M${CX} ${CY} Q ${mx} ${my} ${n.x} ${n.y}`}
                fill="none"
                stroke="url(#cc-edge)"
                strokeWidth={n.role === "tag" ? 0.8 : 0.8 + aff * 1.4}
                strokeDasharray={n.role === "tag" ? "3 4" : undefined}
                opacity={dim ? 0.08 : n.role === "tag" ? 0.45 : 0.35 + aff * 0.5}
                className="cc-animate-draw"
                style={{ ["--cc-dash" as string]: 700, animationDelay: `${Math.min(i * 30, 600)}ms` }}
              />
            );
          })}
          {relationships.map((r) => {
            const a = byId.get(r.from);
            const b = byId.get(r.to);
            if (!a || !b || !visible(b)) return null;
            const on = selectedId && (r.from === selectedId || r.to === selectedId);
            return <path key={r.id} d={`M${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 40} ${b.x} ${b.y}`} fill="none" stroke="#F29A8B" strokeWidth={on ? 1.6 : 0.8} strokeDasharray="2 5" opacity={selectedId ? (on ? 0.9 : 0.06) : 0.35} />;
          })}
        </svg>

        {/* Audience centre (the research signal) */}
        <div className="pointer-events-none absolute" style={{ left: CX - 105, top: CY - 95, width: 210, height: 190 }}>
          <div className="absolute -inset-10 rounded-full bg-peach/50 blur-3xl" />
          <div className="absolute inset-0 rounded-[46%_54%_42%_58%/55%_45%_55%_45%] bg-[radial-gradient(circle_at_35%_30%,#E8DFFF,#B8A5FF_45%,#8064F5_85%)] opacity-90 shadow-[0_30px_60px_-20px_rgba(128,100,245,0.7)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
            <span className="cc-eyebrow text-[9px] text-white/80">Research signal</span>
            <span className="mt-1 text-[15px] font-medium leading-tight">{audienceLabel}</span>
          </div>
        </div>

        {nodes.filter(visible).map((n) => {
          const match = q && n.name.toLowerCase().includes(q);
          const dim = (connected && !connected.has(n.id)) || (q && !match);
          const sel = n.id === selectedId;
          const label = `${n.name}, ${n.role === "tag" ? "taste tag" : n.type}${n.affinity !== null ? `, affinity ${n.affinity.toFixed(2)}` : ""}`;
          if (n.card) {
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                aria-label={label}
                aria-pressed={sel}
                className={cn(
                  "absolute overflow-hidden rounded-[18px] text-left text-white shadow-[0_20px_40px_-18px_rgba(23,21,30,0.7)] transition-[opacity,transform,box-shadow] duration-300 focus-visible:outline-4",
                  sel ? "z-20 scale-110 ring-4 ring-violet" : "z-10 hover:scale-105",
                  dim && "opacity-25",
                )}
                style={{ left: n.x - 50, top: n.y - 62, width: 100, height: 124 }}
              >
                <ArtPlate theme={TYPE_THEME[n.type] ?? theme} seed={n.providerId} rounded={false} className="absolute inset-0" />
                <span className="absolute inset-x-2 bottom-2">
                  <span className="block truncate text-[12px] font-semibold leading-tight">{n.name}</span>
                  <span className="block text-[10px] text-white/75">{n.affinity !== null ? `affinity ${n.affinity.toFixed(2)}` : n.type}</span>
                </span>
              </button>
            );
          }
          return (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              aria-label={label}
              aria-pressed={sel}
              className={cn("group absolute flex items-center gap-1.5 transition-opacity duration-300", sel ? "z-20" : "z-10", dim && "opacity-25")}
              style={{ left: n.x - 7, top: n.y - 7 }}
            >
              <span
                className={cn(
                  "block size-3.5 shrink-0 rounded-full border-2 border-white shadow transition-transform",
                  n.role === "seed" ? "size-4 bg-ink" : n.role === "tag" ? "bg-coral" : "bg-violet",
                  sel && "scale-150 ring-4 ring-lilac",
                  match && "ring-4 ring-peach",
                )}
              />
              <span className={cn("max-w-[130px] truncate rounded-full px-1.5 text-[11px] leading-5", n.role === "seed" ? "bg-ink font-medium text-white" : "bg-white/70 text-ink/80 backdrop-blur group-hover:bg-white")}>
                {n.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cc-glass absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-full">
        <button onClick={() => setView({ x: 0, y: 0, k: 1 })} className="p-2.5 hover:bg-ink/5" aria-label="Reset view"><LocateFixed className="size-4" /></button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(2.6, v.k * 1.2) }))} className="p-2.5 hover:bg-ink/5" aria-label="Zoom in"><Plus className="size-4" /></button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.5, v.k / 1.2) }))} className="p-2.5 hover:bg-ink/5" aria-label="Zoom out"><Minus className="size-4" /></button>
      </div>
    </div>
  );
}
