"use client";

import { CheckCircle2 } from "lucide-react";

/** Inline result line for settings forms (paired with toasts for screen readers). */
export function FormStatus({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="text-[12px] text-danger">{error}</p>;
  if (success) return <p role="status" className="flex items-center gap-1.5 text-[12px] text-success"><CheckCircle2 className="size-3.5" /> {success}</p>;
  return null;
}
