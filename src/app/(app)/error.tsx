"use client";

import Link from "next/link";
import { ErrorNotice } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const config = /not configured|DATABASE_URL|configuration/i.test(error.message);
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <ErrorNotice
        title={config ? "CultureCrash is not fully configured" : "This view could not be loaded"}
        body={config ? "A required server setting is missing. An administrator should check the environment variables described in the README." : "The request failed before the page could render. Nothing was changed. You can retry, or return to the dashboard."}
      >
        <Button size="sm" onClick={reset}>Retry</Button>
        <Button size="sm" variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
      </ErrorNotice>
      {error.digest && <p className="mt-3 text-[11px] text-faint">Reference: {error.digest}</p>}
    </div>
  );
}
