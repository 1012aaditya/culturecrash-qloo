import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { ReportDocument } from "@/components/reports/report-document";
import { EmptyState } from "@/components/states";
import { withAnon } from "@/lib/db";
import type { ReportSnapshot } from "@/lib/reports/types";
import { hashToken } from "@/lib/reports/token";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Shared report", robots: { index: false, follow: false } };

/** Public, read-only. Access goes through a SECURITY DEFINER function keyed by the token hash. */
export default async function SharedReportPage({ params }: PageProps<"/reports/shared/[shareId]">) {
  const { shareId } = await params;
  const valid = /^[A-Za-z0-9_-]{30,80}$/.test(shareId);
  const rows = valid ? await withAnon((tx) => tx`select * from get_shared_report(${hashToken(shareId)})`) : [];
  const r = rows[0];
  return (
    <div className="cc-atmosphere min-h-dvh px-3 py-6 sm:px-6">
      <header className="mx-auto mb-6 flex max-w-[980px] items-center justify-between">
        <Logo href="/" />
        <span className="text-[12px] text-muted">Read-only shared report{r?.expires_at ? ` · link expires ${formatDateTime(r.expires_at)}` : ""}</span>
      </header>
      <main id="main">
        {r ? <ReportDocument s={r.snapshot as ReportSnapshot} version={r.version} createdAt={new Date(r.created_at).toISOString()} /> : (
          <div className="mx-auto max-w-lg py-20"><EmptyState title="This link is not available" body="The link may have expired or been revoked by the report owner, or it was copied incorrectly." /></div>
        )}
      </main>
    </div>
  );
}
