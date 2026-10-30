"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Link2, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { EntityImage } from "@/components/art/entity-image";
import { TYPE_LABEL, TYPE_THEME } from "@/components/research/cultural-network";
import { Button } from "@/components/ui/button";
import { colourName } from "@/lib/boards/colour";
import { boardSections, type DirectionBrief, type SectionNode } from "@/lib/boards/sections";
import { cn } from "@/lib/utils";

type Slide = { label: string; body: React.ReactNode };

const host = (url: unknown) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * The board as client slides: title, idea, visual language, palette, cultural world, message and tone,
 * proof. Empty sections are skipped and team notes are never shown. Found-reference images are marked.
 */
export function BoardSlides({ name, nodes, direction, onClose, onCopyLink, onMediaError }: {
  name: string; nodes: SectionNode[]; direction: DirectionBrief | null; onClose: () => void; onCopyLink: () => void; onMediaError: () => void;
}) {
  const s = React.useMemo(() => boardSections(nodes), [nodes]);
  const slides = React.useMemo(() => buildSlides(name, s, direction, onMediaError), [name, s, direction, onMediaError]);
  const [i, setI] = React.useState(0);
  const shell = React.useRef<HTMLDivElement>(null);
  const go = React.useCallback((n: number) => setI(Math.max(0, Math.min(slides.length - 1, n))), [slides.length]);

  React.useEffect(() => {
    void shell.current?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); setI((n) => Math.min(slides.length - 1, n + 1)); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
      else if (e.key === "Escape") onClose();
    };
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose, slides.length]);

  const slide = slides[i];
  return (
    <div ref={shell} className="fixed inset-0 z-50 flex flex-col bg-[#17151e] text-white" role="dialog" aria-modal="true" aria-label={`Presenting “${name}”`}>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 sm:p-12">
        <div key={i} className="flex h-full max-h-[820px] w-full max-w-[1400px] flex-col animate-[cc-fade-in_.35s_ease-out]">
          <p className="cc-eyebrow text-white/50">{String(i + 1).padStart(2, "0")} · {slide.label}</p>
          <div className="mt-5 min-h-0 flex-1">{slide.body}</div>
        </div>
      </div>
      <div className="flex justify-center pb-5">
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1.5 backdrop-blur" role="toolbar" aria-label="Presentation controls">
          <Button variant="ghost-dark" size="icon-sm" aria-label="Previous" disabled={i === 0} onClick={() => go(i - 1)}><ChevronLeft /></Button>
          <span className="min-w-40 px-2 text-center text-[13px] font-medium" aria-live="polite">{slide.label} <span className="text-white/50">· {i + 1}/{slides.length}</span></span>
          <Button variant="ghost-dark" size="icon-sm" aria-label="Next" disabled={i >= slides.length - 1} onClick={() => go(i + 1)}><ChevronRight /></Button>
          <Button variant="ghost-dark" size="sm" onClick={onCopyLink}><Link2 /> Copy link</Button>
          <Button variant="ghost-dark" size="icon-sm" aria-label="Exit presentation" title="Exit (Esc)" onClick={onClose}><X /></Button>
        </div>
      </div>
    </div>
  );
}

function buildSlides(name: string, s: ReturnType<typeof boardSections>, d: DirectionBrief | null, onMediaError: () => void): Slide[] {
  const out: Slide[] = [];
  const cover = s.images.find((n) => n.data.url || n.data.thumbUrl);
  out.push({
    label: "Title",
    body: (
      <div className="grid h-full items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          {d && <p className="text-[15px] text-[#b8a5ff]">Direction 0{d.slot}</p>}
          <h1 className="cc-display mt-2 text-5xl leading-[1.02] sm:text-7xl">{d?.name ?? name}</h1>
          {d?.coreIdea && <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white/80">{d.coreIdea}</p>}
        </div>
        {cover && <SlideImage node={cover} className="h-full max-h-[620px]" onError={onMediaError} />}
      </div>
    ),
  });
  if (d && (d.positioning || d.audience || d.brandRole)) {
    out.push({
      label: "The idea",
      body: (
        <div className="flex h-full flex-col justify-center">
          {d.positioning && <p className="cc-display max-w-5xl text-3xl leading-snug sm:text-[44px]">{d.positioning}</p>}
          <div className="mt-10 grid max-w-5xl gap-8 text-[17px] leading-relaxed text-white/75 md:grid-cols-2">
            {d.audience && <div><p className="cc-eyebrow mb-2 text-white/45">Who it’s for</p>{d.audience}</div>}
            {d.brandRole && <div><p className="cc-eyebrow mb-2 text-white/45">The brand’s role</p>{d.brandRole}</div>}
          </div>
        </div>
      ),
    });
  }
  for (let k = 0; k < s.images.length; k += 9) {
    const set = s.images.slice(k, k + 9);
    out.push({
      label: s.images.length > 9 ? `Visual language ${k / 9 + 1}` : "Visual language",
      body: (
        <div className={cn("grid h-full gap-3", set.length <= 2 ? "grid-cols-2" : set.length <= 4 ? "grid-cols-2 grid-rows-2" : "grid-cols-3 grid-rows-3")}>
          {set.map((n, j) => <SlideImage key={n.id} node={n} className={cn("h-full", set.length === 5 && j === 0 && "row-span-2", set.length === 3 && j === 0 && "row-span-2")} onError={onMediaError} />)}
        </div>
      ),
    });
  }
  if (s.palette.length) {
    out.push({
      label: "Palette",
      body: (
        <div className="flex h-full gap-3">
          {s.palette.map((c) => (
            <div key={c} className="flex flex-1 flex-col">
              <span className="block flex-1 rounded-cc-lg" style={{ background: c }} />
              <p className="mt-3 text-[16px] font-medium">{colourName(c)}</p>
              <p className="font-mono text-[13px] uppercase text-white/55">{c}</p>
            </div>
          ))}
        </div>
      ),
    });
  }
  const culture = s.culture.flatMap((g) => g.nodes).sort((a, b) => Number(b.data.affinity ?? -1) - Number(a.data.affinity ?? -1)).slice(0, 12);
  if (culture.length) {
    out.push({
      label: "Cultural world",
      body: (
        <div className="flex h-full flex-col">
          <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-4 lg:grid-cols-4">
            {culture.map((n) => (
              <div key={n.id} className="flex min-h-0 items-center gap-4 rounded-cc-lg bg-white/[0.06] p-4">
                <EntityImage src={n.data.imageUrl as string | null} theme={TYPE_THEME[String(n.data.type)] ?? "culture"} seed={String(n.data.entityId)} className="size-16 shrink-0 !rounded-[10px]" />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[18px] font-medium leading-snug">{String(n.data.name)}</p>
                  <p className="text-[13px] text-white/55">{TYPE_LABEL[String(n.data.type)] ?? String(n.data.type)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-white/45">Taste affinities from Qloo: what this audience over-indexes on. Correlation, not purchase intent.</p>
        </div>
      ),
    });
  }
  const pillars = d?.messagingPillars ?? [];
  if (pillars.length || s.dos.length || s.donts.length) {
    out.push({
      label: "Message and tone",
      body: (
        <div className="grid h-full content-center gap-10 md:grid-cols-2">
          {pillars.length > 0 && (
            <ol className="space-y-5">
              {pillars.map((p, j) => <li key={j} className="flex gap-4 text-[22px] leading-snug"><span className="font-mono text-[15px] text-[#b8a5ff]">0{j + 1}</span>{p}</li>)}
            </ol>
          )}
          <div className="space-y-6">
            {s.dos.length > 0 && <Guard icon={ThumbsUp} title="Do" items={s.dos} tint="text-[#b8a5ff]" />}
            {s.donts.length > 0 && <Guard icon={ThumbsDown} title="Don’t" items={s.donts} tint="text-[#f4a582]" />}
          </div>
        </div>
      ),
    });
  }
  if (s.proof.length) {
    out.push({
      label: "Proof",
      body: (
        <div className="grid h-full content-center gap-5 md:grid-cols-2">
          {s.proof.slice(0, 4).map((n) => (
            <figure key={n.id} className="rounded-cc-lg bg-white/[0.06] p-6">
              <blockquote className="text-[20px] leading-snug">{String(n.data.claim)}</blockquote>
              <figcaption className="mt-3 text-[13px] text-white/55">{host(n.data.url) || String(n.data.source || "Research")}</figcaption>
            </figure>
          ))}
        </div>
      ),
    });
  }
  return out;
}

function Guard({ icon: Icon, title, items, tint }: { icon: React.ComponentType<{ className?: string }>; title: string; items: SectionNode[]; tint: string }) {
  return (
    <div>
      <p className={cn("mb-2 flex items-center gap-2 text-[15px] font-medium", tint)}><Icon className="size-4" /> {title}</p>
      <ul className="space-y-1.5 text-[18px] leading-snug text-white/85">{items.map((n) => <li key={n.id}>{String(n.data.text)}</li>)}</ul>
    </div>
  );
}

function SlideImage({ node, className, onError }: { node: SectionNode; className?: string; onError: () => void }) {
  const reference = (node.data.rights ?? "reference") === "reference";
  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-cc-lg bg-white/5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
      <img src={String(node.data.url ?? node.data.thumbUrl ?? "")} alt={String(node.data.alt || node.data.title || "")} className="h-full w-full object-cover" onError={onError} />
      {reference && <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white/85">Reference only{host(node.data.sourceUrl) ? ` · ${host(node.data.sourceUrl)}` : ""}</span>}
    </div>
  );
}
