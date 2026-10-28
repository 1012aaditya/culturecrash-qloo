import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Comments } from "@/components/evidence/comments";
import { ReviewControl } from "@/components/evidence/review-control";
import { DemoBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { generatorLabel } from "@/lib/ai";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/data/projects";
import { getProjectContext } from "@/lib/data/project-context";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Evidence" };

export default async function EvidencePage({ params }: PageProps<"/projects/[projectId]/evidence/[evidenceId]">) {
  const { projectId, evidenceId } = await params;
  if (!isUuid(evidenceId)) notFound();
  const { ctx } = await getProjectContext(projectId);
  const data = await withUser(ctx.user.id, async (tx) => {
    const [ev] = await tx`select * from evidence_items where id = ${evidenceId} and project_id = ${projectId}`;
    if (!ev) return null;
    const sourceId = ev.raw_metadata?.source_id ?? null;
    const [source] = sourceId ? await tx`select * from research_sources where id = ${sourceId}` : [];
    const entities = ev.entity_ids?.length ? await tx`select id, name, entity_type, provider_entity_id, affinity, popularity, tags, role from cultural_entities where id = any(${ev.entity_ids})` : [];
    const supportIds: string[] = ev.raw_metadata?.supporting_evidence_ids ?? [];
    const support = supportIds.length ? await tx`select id, claim from evidence_items where id = any(${supportIds}) and project_id = ${projectId}` : [];
    const [run] = ev.run_id ? await tx`select id, mode, created_at, question from research_runs where id = ${ev.run_id}` : [];
    const comments = await tx`select c.id, c.body, c.created_at, coalesce(p.full_name, p.email) as author from comments c left join profiles p on p.id = c.author_id
      where c.target_type = 'evidence' and c.target_id = ${evidenceId} order by c.created_at`;
    return { ev, source, entities, support, run, comments };
  });
  if (!data) notFound();
  const { ev, source, entities, support, run, comments } = data;
  const label = EVIDENCE_LABEL[ev.evidence_type];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={label.tone}>{label.label}</Badge>{ev.is_demo && <DemoBadge />}<Badge tone="outline">{ev.review_status.replace("_", " ")}</Badge></div>
          <h1 className="cc-display mt-4 text-4xl md:text-5xl">{ev.claim}</h1>
          <p className="mt-3 text-[13px] text-muted">{label.explain}</p>
        </div>
        <Surface className="p-6">
          <h2 className="text-[14px] font-semibold">Provenance</h2>
          <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-2 text-[13px]">
            <dt className="text-muted">Source</dt><dd>{ev.source_provider === "template-engine" || ev.source_provider?.startsWith("llm:") ? generatorLabel(ev.source_provider) : ev.source_provider ?? "—"}</dd>
            <dt className="text-muted">Provider reference</dt><dd className="break-all font-mono text-[12px]">{ev.source_ref ?? "—"}</dd>
            {ev.source_url && (<><dt className="text-muted">URL</dt><dd><a href={ev.source_url} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-violet underline">{ev.source_url}</a></dd></>)}
            <dt className="text-muted">Retrieved</dt><dd>{ev.retrieved_at ? formatDateTime(ev.retrieved_at) : "—"}</dd>
            <dt className="text-muted">Normalized value</dt><dd className="tabular-nums">{ev.normalized_value ?? "—"}</dd>
            {run && (<><dt className="text-muted">Research run</dt><dd><Link className="text-violet hover:underline" href={`/projects/${projectId}/research?run=${run.id}`}>{formatDateTime(run.created_at)} ({run.mode})</Link></dd></>)}
            <dt className="text-muted">Limitations</dt><dd className="text-muted">{ev.limitations ?? "None recorded."}</dd>
          </dl>
        </Surface>
        {support.length > 0 && (
          <Surface className="p-6">
            <h2 className="text-[14px] font-semibold">Supporting observations</h2>
            <ul className="mt-3 space-y-2 text-[13px]">{support.map((s) => <li key={s.id}><Link href={`/projects/${projectId}/evidence/${s.id}`} className="hover:text-violet">{s.claim}</Link></li>)}</ul>
          </Surface>
        )}
        {source && (
          <Surface className="p-6">
            <h2 className="text-[14px] font-semibold">Underlying provider response</h2>
            <p className="mt-1 text-[12px] text-muted">Request: <span className="font-mono">{source.endpoint}</span> · HTTP {source.http_status ?? "—"} · {source.result_count} results · {formatDateTime(source.retrieved_at)}. The API key is never stored.</p>
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-cc-sm bg-ink p-3 font-mono text-[11px] text-white/85">{JSON.stringify(source.params, null, 2)}</pre>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-medium">Raw response JSON</summary>
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-cc-sm bg-ink p-3 font-mono text-[11px] text-white/85">{JSON.stringify(source.raw_response, null, 2)}</pre>
            </details>
          </Surface>
        )}
      </div>
      <div className="space-y-5">
        <Surface className="p-6">
          <ReviewControl projectId={projectId} evidenceId={evidenceId} status={ev.review_status} disabled={!can(ctx.workspace.role, "strategy.edit")} />
        </Surface>
        {entities.length > 0 && (
          <Surface className="p-6">
            <h2 className="text-[14px] font-semibold">Entities</h2>
            <ul className="mt-3 space-y-2 text-[13px]">
              {entities.map((e) => <li key={e.id} className="flex justify-between gap-2"><span>{e.name} <span className="text-muted">· {e.entity_type} · {e.role}</span></span><span className="tabular-nums">{e.affinity ?? "—"}</span></li>)}
            </ul>
          </Surface>
        )}
        <Surface className="p-6">
          <Comments projectId={projectId} targetType="evidence" targetId={evidenceId} path={`/projects/${projectId}/evidence/${evidenceId}`} canComment={can(ctx.workspace.role, "comment.create")} comments={comments.map((c) => ({ id: c.id, body: c.body, author: c.author ?? "Someone", createdAt: new Date(c.created_at).toISOString() }))} />
        </Surface>
      </div>
    </div>
  );
}
