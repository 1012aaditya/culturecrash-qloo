"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withUser } from "@/lib/db";
import { isUuid } from "./projects";
import { getCtx, WORKSPACE_COOKIE } from "./workspace";

/** Marks all of the caller's notifications as read. RLS limits this to their own rows. */
export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const ctx = await getCtx();
  await withUser(ctx.user.id, (tx) => tx`update notifications set read_at = now() where user_id = ${ctx.user.id} and read_at is null`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Marks one notification read, switches to its workspace if needed, and opens its link. */
export async function openNotificationAction(id: string) {
  if (!isUuid(id)) return;
  const ctx = await getCtx();
  const n = await withUser(ctx.user.id, async (tx) => {
    const [row] = await tx`update notifications set read_at = coalesce(read_at, now()) where id = ${id} and user_id = ${ctx.user.id} returning workspace_id, href`;
    return row;
  });
  if (!n) return;
  if (n.workspace_id !== ctx.workspace.workspaceId && ctx.memberships.some((m) => m.workspaceId === n.workspace_id)) {
    (await cookies()).set(WORKSPACE_COOKIE, n.workspace_id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/", "layout");
  redirect(typeof n.href === "string" && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/dashboard");
}
