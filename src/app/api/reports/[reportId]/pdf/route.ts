import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { trackEvent } from "@/lib/data/activity";
import { isUuid } from "@/lib/data/projects";
import { boardImagesAsJpeg } from "@/lib/boards/data";
import { renderReportPdf } from "@/lib/reports/pdf";
import type { ReportSnapshot } from "@/lib/reports/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/reports/[reportId]/pdf">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { reportId } = await params;
  const v = Number(request.nextUrl.searchParams.get("v")) || null;
  if (!isUuid(reportId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = await withUser(user.id, async (tx) => {
    const [r] = await tx`select v.version, v.snapshot, v.created_at, r.title, r.project_id, r.workspace_id from report_versions v join reports r on r.id = v.report_id
      where v.report_id = ${reportId} ${v ? tx`and v.version = ${v}` : tx``} order by v.version desc limit 1`;
    if (r) await trackEvent(tx, { workspaceId: r.workspace_id, userId: user.id, event: "report_exported", projectId: r.project_id, metadata: { version: r.version } });
    return r;
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const snap = row.snapshot as ReportSnapshot;
    const images = snap.sections.includes("visual") ? await boardImagesAsJpeg((snap.visualWorld?.images ?? []).map((i) => i.thumbPath ?? i.path)) : new Map<string, Buffer>();
    const pdf = await renderReportPdf(snap, row.version, new Date(row.created_at).toISOString(), images);
    const name = `${String(row.title).replace(/[^\w-]+/g, "-").slice(0, 60)}-v${row.version}.pdf`;
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("[pdf] render failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The PDF could not be generated. The report itself is unaffected; try again or export a different version." }, { status: 500 });
  }
}
