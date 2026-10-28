"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExperimentForm, type ExperimentDraft } from "./experiment-form";

export function NewExperiment({ projectId, initial, directions, defaultOpen }: { projectId: string; initial: ExperimentDraft; directions: { id: string; name: string }[]; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New experiment</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Design an experiment" description="Agree the hypothesis, metric and decision threshold before any result comes in." className="max-h-[85vh] w-[min(820px,calc(100vw-24px))] overflow-y-auto">
          <ExperimentForm projectId={projectId} initial={initial} directions={directions} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
