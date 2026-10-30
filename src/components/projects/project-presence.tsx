"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { Avatar } from "@/components/nav/avatar";
import type { PresencePeer } from "@/app/api/projects/[projectId]/presence/route";
import { cn } from "@/lib/utils";

const BEAT_MS = 5_000;
const PAGE_LABEL: Record<string, string> = {
  overview: "Overview", brief: "Brief", research: "Research", evidence: "Evidence", opportunities: "Opportunities",
  strategy: "Strategy", "creative-brief": "Creative brief", experiments: "Experiments", reports: "Reports", boards: "Inspiration boards",
};

/**
 * Presence for one project: who else is here, on which page, and which field they are in.
 * A heartbeat (every 5 s, and immediately when your focused field changes) records your
 * position and returns everyone active in the last 30 s. Fields opt in with
 * `data-presence-field`; a field a teammate is editing gets `data-peer-editing` (styled in CSS).
 */
export function ProjectPresence({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const page = pathname.split("/")[3]?.match(/^[a-z-]{1,40}$/)?.[0] ?? "overview";
  const [peers, setPeers] = React.useState<PresencePeer[]>([]);
  const field = React.useRef<string | null>(null);
  const beatRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    let alive = true;
    let inFlight = false;
    const beat = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/projects/${projectId}/presence`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, field: field.current }),
        });
        // Always read the body, even after unmount, so the request completes.
        const data = res.ok ? ((await res.json()) as { peers: PresencePeer[] }) : (await res.body?.cancel(), null);
        if (data && alive) setPeers(data.peers);
      } catch {
        // offline: keep the last known peers until the next beat
      } finally {
        inFlight = false;
      }
    };
    beatRef.current = beat;
    void beat();
    const id = window.setInterval(beat, BEAT_MS);
    const onVisible = () => void beat();
    const leave = () => {
      void fetch(`/api/projects/${projectId}/presence`, {
        method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, field: null, leave: true }),
      }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", leave);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
    };
  }, [projectId, page]);

  // Track the focused field (debounced so tabbing through a form sends one beat).
  React.useEffect(() => {
    let t: number | undefined;
    const update = () => {
      const el = document.activeElement?.closest<HTMLElement>("[data-presence-field]");
      const next = el?.dataset.presenceField ?? null;
      if (next === field.current) return;
      field.current = next;
      window.clearTimeout(t);
      t = window.setTimeout(() => beatRef.current(), 300);
    };
    const onOut = () => window.setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onOut);
      window.clearTimeout(t);
    };
  }, []);

  // Mark fields that teammates on this page are editing.
  React.useEffect(() => {
    const here = peers.filter((p) => p.page === page && p.field);
    const marked = new Set<HTMLElement>();
    for (const p of here) {
      const el = document.querySelector<HTMLElement>(`[data-presence-field="${CSS.escape(p.field!)}"]`);
      if (!el) continue;
      const first = p.name.split(/\s+/)[0];
      el.dataset.peerEditing = el.dataset.peerEditing && marked.has(el) ? `${el.dataset.peerEditing}, ${first}` : first;
      marked.add(el);
    }
    return () => marked.forEach((el) => delete el.dataset.peerEditing);
  }, [peers, page]);

  const labelFor = (p: PresencePeer) => {
    if (p.page === page && p.field) {
      const label = document.querySelector(`[data-presence-field="${CSS.escape(p.field)}"] label, [data-presence-field="${CSS.escape(p.field)}"] h2`)?.textContent?.trim();
      return `editing ${label || "a field"}`;
    }
    return `on ${PAGE_LABEL[p.page] ?? p.page}`;
  };

  if (!peers.length) return null;
  const shown = peers.slice(0, 4);
  return (
    <div className="cc-animate-in ml-auto flex items-center gap-2" aria-label={`${peers.length} ${peers.length === 1 ? "person" : "people"} here now`}>
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <span key={p.userId} className="group relative">
            <Avatar name={p.name} className="size-7 text-[10px] ring-2 ring-ivory transition-transform duration-200 group-hover:-translate-y-0.5" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-ivory bg-success" aria-hidden="true" />
            <span role="tooltip" className="pointer-events-none absolute right-0 top-9 z-30 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[11px] text-white opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100">
              {p.name} · {labelFor(p)}
            </span>
          </span>
        ))}
        {peers.length > shown.length && <span className="flex size-7 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold ring-2 ring-ivory">+{peers.length - shown.length}</span>}
      </div>
      <span className={cn("hidden text-[12px] text-muted sm:inline")}>
        {peers.length === 1 ? `${peers[0].name.split(/\s+/)[0]} is ${labelFor(peers[0])}` : `${peers.length} teammates here`}
      </span>
    </div>
  );
}
