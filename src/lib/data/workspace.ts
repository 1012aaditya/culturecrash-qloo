import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { withUser } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import type { Role } from "@/lib/permissions";

export const WORKSPACE_COOKIE = "cc_ws";

export type Membership = { workspaceId: string; name: string; role: Role; isDemo: boolean };

export type Ctx = {
  user: SessionUser;
  profile: { fullName: string | null; email: string; jobTitle: string | null };
  workspace: Membership;
  memberships: Membership[];
};

/**
 * Resolves the verified user and their active workspace. The workspace cookie is only
 * a preference: membership is re-checked against the database on every request.
 */
export const getCtx = cache(async (): Promise<Ctx> => {
  const user = await requireUser();
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return withUser(user.id, async (tx) => {
    const memberships = await tx<{ workspace_id: string; name: string; role: Role; is_demo: boolean }[]>`
      select m.workspace_id, w.name, m.role, w.is_demo
      from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = ${user.id}
      order by w.is_demo, m.created_at`;
    const [profile] = await tx<{ full_name: string | null; email: string; job_title: string | null }[]>`
      select full_name, email, job_title from profiles where id = ${user.id}`;
    const list: Membership[] = memberships.map((m) => ({
      workspaceId: m.workspace_id,
      name: m.name,
      role: m.role,
      isDemo: m.is_demo,
    }));
    if (!list.length) throw new Error("This account has no workspace membership.");
    const workspace = list.find((m) => m.workspaceId === preferred) ?? list[0];
    return {
      user,
      profile: { fullName: profile?.full_name ?? null, email: profile?.email ?? user.email, jobTitle: profile?.job_title ?? null },
      workspace,
      memberships: list,
    };
  });
});

export function firstName(ctx: Ctx) {
  return ctx.profile.fullName?.split(" ")[0] ?? ctx.user.email.split("@")[0];
}
