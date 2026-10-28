import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { Building2, FileText, FlaskConical, FolderOpen, Lightbulb, ListChecks, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { getCtx } from "@/lib/data/workspace";
import { searchWorkspace, type SearchHit } from "@/lib/data/search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

const TYPES: { key: SearchHit["type"]; label: string; plural: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "project", label: "Campaign", plural: "Campaigns", icon: FolderOpen },
  { key: "client", label: "Client", plural: "Clients", icon: Building2 },
  { key: "evidence", label: "Evidence", plural: "Evidence", icon: ListChecks },
  { key: "strategy", label: "Strategy", plural: "Strategies", icon: Lightbulb },
  { key: "report", label: "Report", plural: "Reports", icon: FileText },
  { key: "experiment", label: "Experiment", plural: "Experiments", icon: FlaskConical },
];
const isType = (v: string): v is SearchHit["type"] => TYPES.some((t) => t.key === v);

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-lilac px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 120);
  const type = first(sp.type);
  const active = isType(type) ? type : null;
  const ctx = await getCtx();
  const hits = q.length >= 2 ? await searchWorkspace(ctx, q, active ? [active] : undefined) : [];
  const groups = TYPES.map((t) => ({ ...t, hits: hits.filter((h) => h.type === t.key) })).filter((g) => g.hits.length);
  const link = (t: string | null) => `/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(t ? { type: t } : {}) })}`;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-8">
      <p className="cc-eyebrow text-muted">Search · {ctx.workspace.name}</p>
      <h1 className="cc-display mt-4 text-5xl md:text-6xl">{q ? <>Results for “{q}”</> : "Find anything"}</h1>

      <form method="get" action="/search" role="search" className="cc-glass mt-8 flex items-center gap-2 rounded-full p-1.5 pl-5">
        <Search className="size-4 shrink-0 text-muted" />
        <label htmlFor="q" className="sr-only">Search the workspace</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          autoFocus={!q}
          maxLength={120}
          placeholder="Campaigns, clients, evidence, strategies, reports, experiments…"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint focus:outline-none"
        />
        {active && <input type="hidden" name="type" value={active} />}
        <Button type="submit" className="h-11 px-5">Search</Button>
      </form>

      <nav aria-label="Filter results by type" className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ key: null, plural: "Everything" }, ...TYPES].map((t) => {
          const on = active === t.key;
          return (
            <Link
              key={t.key ?? "all"}
              href={link(t.key)}
              aria-current={on ? "page" : undefined}
              className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px]", on ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink")}
            >
              {t.plural}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        {q.length < 2 ? (
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
            <EmptyState
              icon={Search}
              title={q ? "Type at least two characters" : "Search this workspace"}
              body="Search covers only records you can access in this workspace. Matches are by name, claim, hypothesis or title."
            />
            <div className="rounded-cc-lg border border-line bg-paper p-5 text-[13px] text-muted">
              <p className="font-medium text-ink">Tip</p>
              <p className="mt-1.5 leading-relaxed">Press <kbd className="rounded-md border border-line bg-ivory px-1.5 py-0.5 font-mono text-[11px]">⌘ K</kbd> anywhere to search and jump without leaving the page.</p>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={`Nothing matches “${q}”${active ? ` in ${TYPES.find((t) => t.key === active)!.plural.toLowerCase()}` : ""}`}
            body="Check the spelling, try a shorter word, or search everything. Records in other workspaces are never shown."
            action={active ? { href: link(null), label: "Search everything" } : undefined}
          />
        ) : (
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <p className="text-[13px] text-muted lg:col-span-2" role="status">{hits.length} {hits.length === 1 ? "result" : "results"}{active ? "" : ` across ${groups.length} ${groups.length === 1 ? "type" : "types"}`}. Each type shows its most recent matches.</p>
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`g-${g.key}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 id={`g-${g.key}`} className="cc-eyebrow text-muted">{g.plural} · {g.hits.length}</h2>
                  {!active && <Link href={link(g.key)} className="text-[12px] text-muted hover:text-ink">Only {g.plural.toLowerCase()} →</Link>}
                </div>
                <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
                  {g.hits.map((h) => (
                    <li key={`${h.type}-${h.id}`}>
                      <Link href={h.href} className="flex items-start gap-3 p-3.5 hover:bg-ivory">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-lilac/60 text-violet-ink"><g.icon className="size-4" /></span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[14px] font-medium"><Highlight text={h.title} q={q} /></span>
                          {h.subtitle && <span className="block truncate text-[12px] text-muted">{h.subtitle}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
