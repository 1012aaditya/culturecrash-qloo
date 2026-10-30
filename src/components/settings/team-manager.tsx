"use client";

import { MailPlus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Avatar } from "@/components/nav/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { changeMemberRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/lib/data/settings-actions";
import type { Invitation, Member } from "@/lib/data/workspace-admin";
import type { Role } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { FormStatus } from "./form-status";

const ROLE_HINT: Record<Role, string> = {
  owner: "Full control, including owners and deleting the workspace",
  admin: "Manage team, integrations, clients and approvals",
  member: "Create campaigns, run research, edit strategy",
  viewer: "Read-only access to everything in the workspace",
};

type Props = { members: Member[]; invitations: Invitation[]; canManage: boolean; myRole: Role; myId: string };

export function TeamManager({ members, invitations, canManage, myRole, myId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Member | null>(null);

  const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done: string) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) {
        setError(r.error ?? "That change could not be made.");
        toast({ tone: "error", title: "Change not applied", description: r.error });
        return;
      }
      setError(null);
      setRemoving(null);
      toast({ tone: "success", title: done, description: r.message });
      router.refresh();
    });
  };

  const roleOptions = (current: Role): Role[] => (myRole === "owner" ? ["owner", "admin", "member", "viewer"] : current === "owner" ? ["owner"] : ["admin", "member", "viewer"]);

  return (
    <div className="space-y-8">
      {canManage && <InviteForm />}

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">{members.length} {members.length === 1 ? "member" : "members"}</h3>
          {!canManage && <span className="text-[12px] text-muted">Only admins and owners can change the team.</span>}
        </div>
        {error && <div className="mb-3"><FormStatus error={error} /></div>}
        <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
          {members.map((m) => {
            const self = m.userId === myId;
            const editable = canManage && (m.role !== "owner" || myRole === "owner");
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
                <Avatar name={m.name} className="size-9 border-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {m.name} {self && <span className="text-[12px] font-normal text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted">{[m.email, m.jobTitle].filter(Boolean).join(" · ")} · joined {formatDate(m.joinedAt)}</p>
                </div>
                {editable ? (
                  <Select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    disabled={pending && busy === m.userId}
                    onChange={(e) => run(m.userId, () => changeMemberRoleAction(m.userId, e.target.value as Role), `Role updated for ${m.name}`)}
                    className="h-9 w-[124px] text-[13px]"
                    title={ROLE_HINT[m.role]}
                  >
                    {roleOptions(m.role).map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                  </Select>
                ) : (
                  <Badge tone={m.role === "owner" ? "dark" : m.role === "admin" ? "violet" : "outline"} title={ROLE_HINT[m.role]}>{m.role}</Badge>
                )}
                {editable && !self && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}>
                    <Trash2 className="text-muted" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canManage && (
        <div>
          <h3 className="mb-3 text-[13px] font-medium">Pending invitations</h3>
          {invitations.length === 0 ? (
            <p className="rounded-cc-lg border border-dashed border-line-strong p-4 text-[13px] text-muted">No pending invitations.</p>
          ) : (
            <ul className="divide-y divide-line rounded-cc-lg border border-line bg-paper">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 p-3.5">
                  <span className="flex size-9 items-center justify-center rounded-full bg-lilac/60 text-violet-ink"><MailPlus className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{i.email}</p>
                    <p className="text-[12px] text-muted">Invited as {i.role}{i.invitedBy ? ` by ${i.invitedBy}` : ""} · {formatDate(i.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={pending && busy === i.id} onClick={() => run(i.id, () => revokeInvitationAction(i.id), `Invitation for ${i.email} revoked`)}>
                    <X /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        {removing && (
          <DialogContent title={`Remove ${removing.name}?`} description="They lose access to every campaign, client and report in this workspace immediately. Their past activity stays in the history.">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
              <Button variant="danger" disabled={pending} onClick={() => run(removing.userId, () => removeMemberAction(removing.userId), `${removing.name} removed`)}>
                {pending ? "Removing…" : "Remove member"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function InviteForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member" | "viewer">("member");
  const [status, setStatus] = React.useState<{ error?: string; success?: string; field?: string }>({});
  const [pending, start] = React.useTransition();
  return (
    <form
      className="rounded-cc-lg border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await inviteMemberAction({ email, role });
          if (!r.ok) return setStatus({ error: r.error, field: r.fieldErrors?.email });
          setStatus({ success: r.message });
          setEmail("");
          toast({ tone: "success", title: "Invitation sent" });
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
        <Field label="Invite by email" htmlFor="invite-email" error={status.field}>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@agency.com" required maxLength={254} aria-invalid={Boolean(status.field)} />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending || !email.trim()}><MailPlus /> {pending ? "Inviting…" : "Invite"}</Button>
      </div>
      <div className="mt-3">
        <FormStatus error={status.field ? null : status.error} success={status.success} />
        {!status.error && !status.success && <p className="text-[12px] text-muted">{ROLE_HINT[role]}. People with an existing account are added immediately.</p>}
      </div>
    </form>
  );
}
