"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { reviewEvidenceAction } from "@/lib/data/evidence-actions";
import { Select } from "@/components/ui/field";

export function ReviewControl({ projectId, evidenceId, status, disabled }: { projectId: string; evidenceId: string; status: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <label className="block text-[12px] text-muted">
      Review status
      <Select disabled={disabled || pending} defaultValue={status} className="mt-1" onChange={(e) => start(async () => { await reviewEvidenceAction({ projectId, evidenceId, status: e.target.value as "approved" }); router.refresh(); })}>
        <option value="unreviewed">Unreviewed</option>
        <option value="needs_validation">Needs validation</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </Select>
    </label>
  );
}
