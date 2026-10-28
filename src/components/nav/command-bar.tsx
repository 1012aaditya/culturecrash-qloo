"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Building2, Check, ChevronDown, CircleHelp, Download, FolderOpen, LayoutGrid, LogOut, Menu as MenuIcon, Plus, Search, Settings, Share2, Users, X,
} from "lucide-react";
import * as React from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { switchWorkspaceAction } from "@/app/(app)/actions";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar } from "./avatar";
import { CommandPalette, useCommandPalette } from "./command-palette";
import type { ShellData } from "./types";

function useProjectFromPath() {
  const pathname = usePathname();
  const m = pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/i);
  const report = pathname.match(/^\/projects\/[0-9a-f-]{36}\/reports\/([0-9a-f-]{36})/i);
  const creative = /\/creative-brief$/.test(pathname);
  return { pathname, projectId: m?.[1] ?? null, reportId: report?.[1] ?? null, creative };
}

export function CommandBar({ data }: { data: ShellData }) {
  const { open, setOpen } = useCommandPalette();
  const { pathname, projectId, reportId, creative } = useProjectFromPath();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  React.useEffect(() => setMobileOpen(false), [pathname]);
  const current = data.projects.find((p) => p.id === projectId) ?? null;
  const running = data.tasks.filter((t) => t.status === "running" || t.status === "queued").length;

  return (
    <>
      <header className="cc-no-print pointer-events-none sticky top-0 z-40 px-2.5 pt-2.5 sm:px-4 sm:pt-3">
        <div className="cc-glass pointer-events-auto mx-auto flex h-14 max-w-[1680px] items-center gap-2 rounded-full pl-3 pr-2 sm:gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 pr-1" aria-label="CultureCrash dashboard">
            <LogoMark className="size-7" />
            <span className="hidden text-[17px] font-semibold tracking-[-0.03em] xl:inline">CultureCrash</span>
          </Link>

          <button
            onClick={() => setOpen(true)}
            className="group hidden h-10 min-w-0 flex-1 items-center gap-3 rounded-full border border-line/80 bg-white/70 px-4 text-left text-[13px] text-faint transition-colors hover:border-line-strong hover:bg-white md:flex md:max-w-[560px]"
            aria-label="Open command palette"
          >
            <Search className="size-4 text-muted" />
            <span className="flex-1 truncate">Ask CultureCrash anything…</span>
            <kbd className="rounded-md border border-line bg-ivory px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘ K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Menu>
              <MenuTrigger asChild>
                <button className="hidden h-10 max-w-[240px] items-center gap-2 rounded-full border border-line/80 bg-white/70 px-3.5 text-[13px] font-medium hover:bg-white sm:inline-flex" aria-label="Switch project">
                  <span className={cn("size-2.5 shrink-0 rounded-full", current ? "bg-violet ring-4 ring-lilac" : "bg-line-strong")} />
                  <span className="truncate">{current?.name ?? "All projects"}</span>
                  <ChevronDown className="size-3.5 text-muted" />
                </button>
              </MenuTrigger>
              <MenuContent className="w-72">
                <MenuLabel>Projects in {data.workspace.name}</MenuLabel>
                {data.projects.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted">No campaigns yet.</p>}
                {data.projects.slice(0, 8).map((p) => (
                  <MenuItem key={p.id} asChild>
                    <Link href={`/projects/${p.id}`}>
                      <FolderOpen />
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.isDemo && <span className="text-[10px] text-[#8a3d22]">demo</span>}
                      {p.id === projectId && <Check className="!text-violet" />}
                    </Link>
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem asChild><Link href="/projects"><LayoutGrid /> All projects</Link></MenuItem>
                {data.can.createProject && <MenuItem asChild><Link href="/projects/new"><Plus /> New campaign</Link></MenuItem>}
              </MenuContent>
            </Menu>

            {data.collaborators.length > 1 && (
              <Link href="/settings/team" className="hidden -space-x-2 lg:flex" aria-label={`${data.collaborators.length} workspace members`}>
                {data.collaborators.slice(0, 4).map((c) => <Avatar key={c.id} name={c.name} />)}
              </Link>
            )}

            {reportId && (
              <>
                <Button asChild variant="outline" size="sm" className="hidden h-10 px-4 sm:inline-flex">
                  <Link href={`${pathname}?share=1`}><Share2 /> Share</Link>
                </Button>
                <Button asChild size="sm" className="h-10 px-4">
                  <a href={`/api/reports/${reportId}/pdf`}><Download /> Export</a>
                </Button>
              </>
            )}
            {creative && projectId && (
              <Button asChild size="sm" className="h-10 px-4">
                <a href={`/api/projects/${projectId}/creative-brief/export`}><Download /> Export</a>
              </Button>
            )}

            <Menu>
              <MenuTrigger asChild>
                <button className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label={`Notifications${running ? `, ${running} running` : ""}`}>
                  <Bell className="size-[18px]" />
                  {running > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-violet ring-2 ring-white" />}
                </button>
              </MenuTrigger>
              <MenuContent className="w-80">
                <MenuLabel>Background tasks</MenuLabel>
                {data.tasks.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted">Nothing running. Research runs and generations appear here.</p>}
                {data.tasks.slice(0, 5).map((t) => (
                  <MenuItem key={t.id} asChild>
                    <Link href={t.href ?? "/tasks"} className="!items-start">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.status === "failed" ? "bg-danger" : t.status === "completed" ? "bg-success" : "bg-violet cc-animate-pulse")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.label}</span>
                        <span className="text-[11px] text-muted">{t.status.replace("_", " ")} · {timeAgo(t.updatedAt)}</span>
                      </span>
                    </Link>
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem asChild><Link href="/tasks">Open task center</Link></MenuItem>
              </MenuContent>
            </Menu>

            <Menu>
              <MenuTrigger asChild>
                <button className="hidden items-center gap-2 rounded-full p-1 hover:bg-ink/5 md:inline-flex" aria-label="Account and workspace menu">
                  <Avatar name={data.user.name} className="size-9 border-0" />
                </button>
              </MenuTrigger>
              <MenuContent className="w-72">
                <div className="px-2.5 py-2">
                  <p className="text-[13px] font-medium">{data.user.name}</p>
                  <p className="truncate text-[12px] text-muted">{data.user.email}</p>
                </div>
                <MenuSeparator />
                <MenuLabel>Workspace</MenuLabel>
                {data.memberships.map((m) => (
                  <form key={m.workspaceId} action={switchWorkspaceAction}>
                    <input type="hidden" name="workspaceId" value={m.workspaceId} />
                    <MenuItem asChild>
                      <button type="submit" className="w-full">
                        <Building2 />
                        <span className="flex-1 truncate text-left">{m.name}</span>
                        <span className="text-[11px] capitalize text-muted">{m.role}</span>
                        {m.workspaceId === data.workspace.id && <Check className="!text-violet" />}
                      </button>
                    </MenuItem>
                  </form>
                ))}
                <MenuSeparator />
                <MenuItem asChild><Link href="/workspace"><Users /> Workspace overview</Link></MenuItem>
                <MenuItem asChild><Link href="/settings/profile"><Settings /> Settings</Link></MenuItem>
                <MenuItem asChild><Link href="/help"><CircleHelp /> Help & feedback</Link></MenuItem>
                <MenuSeparator />
                <form action={signOutAction}>
                  <MenuItem asChild><button type="submit" className="w-full"><LogOut /> Sign out</button></MenuItem>
                </form>
              </MenuContent>
            </Menu>

            <button onClick={() => setOpen(true)} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-ink/5 md:hidden" aria-label="Search">
              <Search className="size-[18px]" />
            </button>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex size-10 items-center justify-center rounded-full bg-ink text-white md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="cc-mobile-menu"
            >
              {mobileOpen ? <X className="size-[18px]" /> : <MenuIcon className="size-[18px]" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav id="cc-mobile-menu" aria-label="Main" className="cc-glass cc-animate-in pointer-events-auto mx-auto mt-2 max-w-[1680px] rounded-cc-lg p-3 md:hidden">
            <p className="cc-eyebrow px-3 pb-2 pt-1 text-[10px] text-faint">{data.workspace.name}</p>
            {[
              ["/dashboard", "Dashboard"], ["/projects", "Projects"], ["/search", "Search"], ["/tasks", "Tasks"],
              ["/workspace/clients", "Clients"], ["/settings/profile", "Settings"], ["/help", "Help"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className={cn("block rounded-cc-sm px-3 py-2.5 text-[15px]", pathname.startsWith(href) && "bg-ink/5 font-medium")}>{label}</Link>
            ))}
            <form action={signOutAction} className="mt-2 border-t border-line pt-2">
              <button type="submit" className="w-full rounded-cc-sm px-3 py-2.5 text-left text-[15px] text-muted">Sign out</button>
            </form>
          </nav>
        )}
      </header>
      <CommandPalette open={open} onOpenChange={setOpen} data={data} projectId={projectId} />
    </>
  );
}
