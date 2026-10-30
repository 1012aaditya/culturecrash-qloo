"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/** Runs a generation server action once (guarded against double clicks) and refreshes. */
export function GenerateButton({
  action, label, pendingLabel, successTitle, autoStart = false, variant, size, onDone, confirm,
}: {
  action: () => Promise<{ ok: boolean; error?: string }>; label: string; pendingLabel: string; successTitle: string; autoStart?: boolean;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; onDone?: () => void;
  /** When set, a dialog with this text must be confirmed first (for actions that replace someone's work). */
  confirm?: { title: string; body: string; action: string };
}) {
  const [asking, setAsking] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const started = React.useRef(false);
  const run = React.useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPending(true);
    let r: { ok: boolean; error?: string };
    try {
      r = await action();
    } catch {
      // A thrown action (timeout, network) must not leave the button spinning.
      r = { ok: false, error: "The request failed or timed out. Nothing was saved; try again." };
    } finally {
      setPending(false);
      started.current = false;
    }
    if (!r.ok) toast({ tone: "error", title: "Not generated", description: r.error });
    else {
      toast({ tone: "success", title: successTitle });
      onDone?.();
      router.refresh();
    }
  }, [action, router, successTitle, toast, onDone]);
  React.useEffect(() => {
    if (autoStart) void run();
  }, [autoStart, run]);
  return (
    <>
      <Button onClick={confirm ? () => setAsking(true) : run} disabled={pending} variant={variant} size={size} aria-live="polite">
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? pendingLabel : label}
      </Button>
      {confirm && (
        <Dialog open={asking} onOpenChange={setAsking}>
          <DialogContent title={confirm.title} description={confirm.body}>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
              <Button onClick={() => { setAsking(false); void run(); }}>{confirm.action}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
