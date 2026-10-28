import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { generatorLabel } from "@/lib/ai";
import { CREATIVE_SECTIONS } from "@/lib/ai/schemas";
import { withUser } from "@/lib/db";
import { loadCreativeBrief } from "@/lib/data/creative";
import { isUuid } from "@/lib/data/projects";

export async function GET(_: Request, { params }: RouteContext<"/api/projects/[projectId]/creative-brief/export">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  if (!isUuid(projectId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await withUser(user.id, async (tx) => {
    const [p] = await tx`select name from projects where id = ${projectId}`;
    if (!p) return null;
    return { name: p.name as string, data: await loadCreativeBrief(tx, projectId) };
  });
  if (!result?.data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { cb, evidence } = result.data;
  const md = [
    `# Creative brief — ${result.name}`,
    "",
    `Direction: ${cb.direction_name ?? "—"} · ${generatorLabel(cb.generator)} · revision ${cb.revision} · exported ${new Date().toISOString()}`,
    cb.is_demo ? "\n> **DEMONSTRATION DATA** — built from fixture records, not live research.\n" : "",
    ...CREATIVE_SECTIONS.flatMap(([k, label]) => [`## ${label}`, "", String(cb.content[k] ?? ""), ""]),
    "## Supporting evidence",
    "",
    ...(evidence.length ? evidence.map((e, i) => `${i + 1}. ${e.claim} — ${e.source_provider}, retrieved ${new Date(e.retrieved_at).toISOString().slice(0, 10)}`) : ["No evidence linked to the selected direction."]),
    "",
    "_Affinity data describes correlations in taste. It is not evidence of purchase intent, campaign effectiveness or causation._",
  ].join("\n");
  const filename = `${result.name.replace(/[^\w-]+/g, "-").slice(0, 60)}-creative-brief.md`;
  return new NextResponse(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` } });
}
