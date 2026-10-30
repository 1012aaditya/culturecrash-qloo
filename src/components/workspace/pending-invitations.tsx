"use client";

import { Check, MailPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { respondToInvitationAction } from "@/lib/data/settings-actions";
import type { MyInvitation } from "@/lib/data/workspace-admin";
import { formatDate } from "@/lib/utils";

/** Invitations wait here until the invitee accepts; accepting switches to that workspace. */
export function PendingInvitations({ invitations }: { invitations: MyInvitation[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (!invitations.length) return null;

  const respond = (i: MyInvitation, accept: boolean) => {
    setBusy(i.id);
    start(async () => {
      // Accepting redirects on success, so only a failure or a decline comes back here.
      const r = await respondToInvitationAction(i.id, accept);
      setBusy(null);
      if (!r.ok) {
        toast({ tone: "error", title: "Invitation not updated", description: r.error });
        return;
      }
      toast({ tone: "success", title: `Declined the invitation to ${i.workspaceName}` });
      router.refresh();
    });
  };

  return (
    <section aria-label="Workspace invitations" className="mb-6 space-y-2">
      {invitations.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-cc-lg border border-line bg-paper p-3.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-lilac/60 text-violet-ink"><MailPlus className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px]">{i.invitedBy ?? "Someone"} invited you to <span className="font-medium">{i.workspaceName}</span> as {i.role}</p>
            <p className="text-[12px] text-muted">{formatDate(i.createdAt)} · nothing changes until you accept</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={pending && busy === i.id} onClick={() => respond(i, false)}><X /> Decline</Button>
            <Button size="sm" disabled={pending && busy === i.id} onClick={() => respond(i, true)}><Check /> Accept</Button>
          </div>
        </div>
      ))}
    </section>
  );
}
