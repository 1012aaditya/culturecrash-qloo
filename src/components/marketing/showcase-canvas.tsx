"use client";

import * as React from "react";
import { CulturalNetwork, TYPE_LABEL } from "@/components/research/cultural-network";
import { DemoBadge } from "@/components/states";
import { showcaseEntities, showcaseRelationships } from "@/lib/showcase";
import { cn } from "@/lib/utils";

export function ShowcaseCanvas() {
  const [selected, setSelected] = React.useState<string | null>("a1");
  const [types, setTypes] = React.useState<Set<string>>(new Set());
  const sel = showcaseEntities.find((x) => x.id === selected);
  const present = [...new Set(showcaseEntities.filter((x) => x.role !== "seed").map((x) => (x.role === "tag" ? "tag" : x.type)))];
  return (
    <div className="grid overflow-hidden rounded-[32px] border border-line bg-paper shadow-card lg:grid-cols-[1.6fr_1fr]">
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <DemoBadge />
          {present.map((t) => (
            <button key={t} aria-pressed={types.has(t)} onClick={() => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              className={cn("rounded-full border px-3 py-1 text-[12px]", types.has(t) ? "border-violet bg-lilac text-violet-ink" : "border-line")}>{TYPE_LABEL[t] ?? t}</button>
          ))}
        </div>
        <div className="h-[560px] bg-[radial-gradient(60%_60%_at_50%_55%,rgba(184,165,255,0.18),transparent_70%)]">
          <CulturalNetwork entities={showcaseEntities} relationships={showcaseRelationships} selectedId={selected} onSelect={setSelected} typeFilter={types} query="" audienceLabel="Sample · India" theme="beauty" />
        </div>
      </div>
      <aside className="border-t border-line p-6 lg:border-l lg:border-t-0" aria-live="polite">
        {sel ? (
          <>
            <p className="cc-eyebrow text-[10px] text-muted">{sel.role === "seed" ? "Signal (from brief)" : sel.role === "tag" ? "Taste tag" : sel.type}</p>
            <h3 className="cc-display mt-1 text-4xl">{sel.name}</h3>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 rounded-cc-sm border border-line p-3 text-[13px]">
              <dt className="text-muted">Affinity (illustrative)</dt><dd className="text-right tabular-nums">{sel.affinity?.toFixed(2) ?? "—"}</dd>
              <dt className="text-muted">Source</dt><dd className="text-right">Demo fixture</dd>
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">In a real campaign this panel shows the provider identifier, the exact request and parameters, retrieval time, related entities and the raw response — with AI interpretation kept visibly separate.</p>
          </>
        ) : <p className="text-[13px] text-muted">Select a node to inspect it.</p>}
      </aside>
    </div>
  );
}
