"use client";

import { Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { visualFuturesAction } from "@/lib/concepts/actions";

/** "Show me these directions": a visual-futures board with two AI concept frames per direction. */
export function VisualFuturesButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const run = async () => {
    if (pending) return;
    setPending(true);
    const r = await visualFuturesAction(projectId).catch(() => ({ ok: false as const, error: "The request failed. Try again." }));
    if (!r.ok) {
      setPending(false);
      return toast({ tone: "error", title: "Visual futures not started", description: r.error });
    }
    toast({ tone: "success", title: `${r.data!.frames} concept frames on their way`, description: "They appear on the new board as the GPU PC finishes them, about two minutes each." });
    router.push(`/projects/${projectId}/boards/${r.data!.boardId}`);
  };
  return (
    <Button variant="accent" onClick={() => void run()} disabled={pending} aria-live="polite">
      {pending ? <Loader2 className="animate-spin" /> : <Eye />} {pending ? "Art directing…" : "Show me these directions"}
    </Button>
  );
}
