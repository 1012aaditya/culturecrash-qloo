"use client";

import { ErrorNotice } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-2xl">
      <ErrorNotice title="This settings section could not be loaded" body="Nothing was changed. Retry, or open another section from the tabs above.">
        <Button size="sm" onClick={reset}>Retry</Button>
      </ErrorNotice>
      {error.digest && <p className="mt-3 text-[11px] text-faint">Reference: {error.digest}</p>}
    </div>
  );
}
