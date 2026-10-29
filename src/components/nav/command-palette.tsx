"use client";

import { Dialog as D } from "radix-ui";
import {
  BarChart3, Building2, FileText, FlaskConical, FolderOpen, LayoutGrid, ListChecks, Lightbulb, Plus, Search, Settings, Sparkles, Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShellData } from "./types";

type Item = { id: string; label: string; hint?: string; group: string; href: string; icon: React.ComponentType<{ className?: string }> };
type Hit = { type: string; id: string; title: string; subtitle: string | null; href: string };

const hitIcon: Record<string, Item["icon"]> = {
  project: FolderOpen, client: Building2, evidence: ListChecks, strategy: Lightbulb, report: FileText, experiment: FlaskConical,
};

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cc:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cc:open-palette", onOpen);
    };
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onOpenChange, data, projectId }: { open: boolean; onOpenChange: (v: boolean) => void; data: ShellData; projectId: string | null }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setQ("");
      setHits([]);
    }
  }

  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).hits);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const actions: Item[] = React.useMemo(() => {
    const list: Item[] = [];
    if (data.can.createProject) list.push({ id: "new", label: "Create campaign", group: "Actions", href: "/projects/new", icon: Plus });
    if (projectId) {
      list.push({ id: "research", label: "Open cultural research", hint: "Explore", group: "This campaign", href: `/projects/${projectId}/research`, icon: Sparkles });
      list.push({ id: "evidence", label: "Search research evidence", hint: "Interpret", group: "This campaign", href: `/projects/${projectId}/opportunities#evidence`, icon: ListChecks });
      list.push({ id: "strategy", label: "Open strategy studio", hint: "Create", group: "This campaign", href: `/projects/${projectId}/strategy`, icon: Lightbulb });
      if (data.can.editExperiments) list.push({ id: "exp", label: "Create an experiment", hint: "Test", group: "This campaign", href: `/projects/${projectId}/experiments?new=1`, icon: FlaskConical });
      if (data.can.createReport) list.push({ id: "report", label: "Generate a report", hint: "Track", group: "This campaign", href: `/projects/${projectId}/reports?new=1`, icon: FileText });
    }
    list.push(
      { id: "dashboard", label: "Dashboard", group: "Go to", href: "/dashboard", icon: LayoutGrid },
      { id: "projects", label: "Search projects", group: "Go to", href: "/projects", icon: FolderOpen },
      { id: "search", label: "Global search", group: "Go to", href: "/search", icon: Search },
      { id: "tasks", label: "Background tasks", group: "Go to", href: "/tasks", icon: BarChart3 },
      { id: "clients", label: "Clients", group: "Go to", href: "/workspace/clients", icon: Building2 },
      { id: "settings", label: "Open settings", group: "Go to", href: "/settings/profile", icon: Settings },
    );
    if (data.can.manageTeam) list.push({ id: "team", label: "Manage team", group: "Go to", href: "/settings/team", icon: Users });
    for (const p of data.projects.slice(0, 6)) {
      list.push({ id: `p-${p.id}`, label: p.name, hint: p.category ?? undefined, group: "Recent projects", href: `/projects/${p.id}`, icon: FolderOpen });
    }
    return list;
  }, [data, projectId]);

  const term = q.trim().toLowerCase();
  const items: Item[] = [
    ...actions.filter((a) => !term || a.label.toLowerCase().includes(term) || a.hint?.toLowerCase().includes(term)),
    ...(term.length >= 2 ? hits : []).map((h) => ({ id: `${h.type}-${h.id}`, label: h.title, hint: h.subtitle ?? undefined, group: "Search results", href: h.href, icon: hitIcon[h.type] ?? Search })),
  ];
  const groups = [...new Set(items.map((i) => i.group))];

  const current = Math.min(active, Math.max(items.length - 1, 0));

  function go(item: Item | undefined) {
    if (!item) return;
    onOpenChange(false);
    router.push(item.href);
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-charcoal/30 backdrop-blur-[3px] data-[state=open]:animate-[cc-fade-in_.2s_ease-out] data-[state=closed]:animate-[cc-fade-out_.12s_ease-in]" />
        <D.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-[10vh] z-50 w-[min(640px,calc(100vw-20px))] -translate-x-1/2 overflow-hidden rounded-cc-lg border border-line bg-paper/95 shadow-[0_40px_100px_-30px_rgba(17,17,22,0.5)] backdrop-blur-xl data-[state=open]:animate-[cc-dialog-in_.3s_var(--cc-ease-out)] data-[state=closed]:animate-[cc-dialog-out_.14s_var(--cc-ease-in)]"
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search projects, evidence and actions. Use arrow keys to move and Enter to open.</D.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); go(items[current]); }
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls="cc-palette-list"
              aria-activedescendant={items[current] ? `cc-item-${items[current].id}` : undefined}
              placeholder="Search projects, evidence, strategies — or type a command"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            />
            {loading && <span className="cc-animate-pulse text-[11px] text-muted">Searching…</span>}
            <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">esc</kbd>
          </div>
          <ul id="cc-palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
            {items.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-muted">
                {term.length >= 2 && !loading ? `Nothing in this workspace matches “${q}”.` : "Type to search."}
              </li>
            )}
            {groups.map((g) => (
              <li key={g} role="presentation">
                <p className="cc-eyebrow px-3 pb-1 pt-3 text-[10px] text-faint">{g}</p>
                <ul role="presentation">
                  {items.map((item, idx) =>
                    item.group !== g ? null : (
                      <li
                        key={item.id}
                        id={`cc-item-${item.id}`}
                        role="option"
                        aria-selected={idx === current}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => go(item)}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px]", idx === current && "bg-lilac/60")}
                      >
                        <item.icon className={cn("size-4 shrink-0", idx === current ? "text-violet" : "text-muted")} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="max-w-[45%] truncate text-[12px] text-muted">{item.hint}</span>}
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
