"use client";

import { Ago } from "@/components/ui/time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, FileText, FlaskConical, TriangleAlert, UserPlus } from "lucide-react";
import * as React from "react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { markAllNotificationsReadAction, openNotificationAction } from "@/lib/data/notification-actions";
import { cn } from "@/lib/utils";
import type { ShellData } from "./types";

type Notifications = ShellData["notifications"];
const POLL_MS = 30_000;

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  research_completed: FlaskConical, research_failed: TriangleAlert, report_shared: FileText, member_added: UserPlus,
};

/** Bell with unread count: in-app notifications plus the latest background tasks. Polls while the tab is visible. */
export function NotificationBell({ initial, tasks }: { initial: Notifications; tasks: ShellData["tasks"] }) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setData(initial);
  }
  const [, start] = React.useTransition();
  const running = tasks.filter((t) => t.status === "running" || t.status === "queued").length;

  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        const next = res.ok ? ((await res.json()) as Notifications) : (await res.body?.cancel(), null);
        if (next && alive) {
          setData((cur) => {
            if (next.unread > cur.unread) router.refresh(); // new work finished: refresh tasks and pages too
            return next;
          });
        }
      } catch {
        // offline or signed out: keep the last known state
      }
    };
    const id = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [router]);

  const label = `Notifications${data.unread ? `, ${data.unread} unread` : ""}${running ? `, ${running} tasks running` : ""}`;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label={label}>
          <Bell className="size-[18px]" />
          {data.unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white tabular-nums">
              {data.unread > 9 ? "9+" : data.unread}
            </span>
          ) : running > 0 ? (
            <span className="absolute right-2 top-2 size-2 rounded-full bg-violet ring-2 ring-white" />
          ) : null}
        </button>
      </MenuTrigger>
      <MenuContent className="w-[22rem] max-w-[calc(100vw-1.5rem)]">
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
          <span className="cc-eyebrow text-[10px] text-muted">Notifications</span>
          {data.unread > 0 && (
            <button
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-muted hover:bg-ink/5 hover:text-ink"
              onClick={() => {
                setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
                start(async () => { await markAllNotificationsReadAction(); });
              }}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        {data.items.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted">No notifications yet. Finished research runs and shared reports show up here.</p>}
        {data.items.slice(0, 6).map((n) => {
          const Icon = ICON[n.kind] ?? Bell;
          return (
            <MenuItem key={n.id} className="!items-start" onSelect={() => {
              if (!n.read) setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) }));
              start(async () => { await openNotificationAction(n.id); });
            }}>
              <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", n.kind === "research_failed" ? "bg-danger/10 [&_svg]:!text-danger" : "bg-lilac/70 [&_svg]:!text-violet")}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", !n.read && "font-semibold")}>{n.title}</span>
                {n.body && <span className="block truncate text-[12px] text-muted">{n.body}</span>}
                <span className="text-[11px] text-muted">{n.workspace ? `${n.workspace} · ` : ""}<Ago value={n.createdAt} /></span>
              </span>
              {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-violet" aria-label="unread" />}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuLabel>Background tasks</MenuLabel>
        {tasks.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted">Nothing running.</p>}
        {tasks.slice(0, 3).map((t) => (
          <MenuItem key={t.id} asChild>
            <Link href={t.href ?? "/tasks"} className="!items-start">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.status === "failed" ? "bg-danger" : t.status === "completed" ? "bg-success" : "bg-violet cc-animate-pulse")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.label}</span>
                <span className="text-[11px] text-muted">{t.status.replace("_", " ")} · <Ago value={t.updatedAt} /></span>
              </span>
            </Link>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild><Link href="/tasks">Open task center</Link></MenuItem>
      </MenuContent>
    </Menu>
  );
}
