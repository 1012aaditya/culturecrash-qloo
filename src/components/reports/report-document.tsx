import { ArtPlate } from "@/components/art/plate";
import { DemoBadge } from "@/components/states";
import { CREATIVE_SECTIONS } from "@/lib/ai/schemas";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { REPORT_SECTIONS, type ReportSnapshot } from "@/lib/reports/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const titleOf = Object.fromEntries(REPORT_SECTIONS);

function Section({ id, n, children, className }: { id: string; n: number; children: React.ReactNode; className?: string }) {
  return (
    <section id={`sec-${id}`} className={cn("break-inside-avoid border-t border-line py-12 first:border-0", className)}>
      <p className="font-mono text-[11px] text-faint">{String(n).padStart(2, "0")}</p>
      <h2 className="cc-display mt-1 text-4xl md:text-5xl">{titleOf[id]}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Editorial report rendered purely from an immutable snapshot. */
export function ReportDocument({ s, version, createdAt }: { s: ReportSnapshot; version: number; createdAt: string }) {
  const on = (k: string) => s.sections.includes(k as never);
  const evIndex = new Map(s.evidence.map((e, i) => [e.id, i + 1]));
  const cite = (ids: string[]) => ids.map((id) => evIndex.get(id)).filter(Boolean).map((n) => <sup key={n} className="ml-0.5 text-violet">[{n}]</sup>);
  let n = 0;
  return (
    <article className="mx-auto max-w-[980px] rounded-[36px] bg-[#fbfaf7] shadow-card print:shadow-none">
      {s.containsDemoData && (
        <div className="flex items-center gap-2 rounded-t-[36px] bg-peach/40 px-8 py-3 text-[13px] text-[#8a3d22]">
          <DemoBadge /> This report contains demonstration data built from fixture records. Do not present it as research.
        </div>
      )}
      {on("cover") && (
        <header className={cn("relative overflow-hidden bg-charcoal p-10 text-white md:p-16", !s.containsDemoData && "rounded-t-[36px]")}>
          <ArtPlate theme="culture" seed={s.projectName} rounded={false} className="absolute inset-0 opacity-70" />
          <div className="relative min-h-[360px]">
            <p className="cc-eyebrow text-white/60">{s.clientName ?? "CultureCrash"} · Cultural strategy report</p>
            <h1 className="cc-display mt-24 text-6xl md:text-8xl">{s.title}</h1>
            <p className="mt-4 text-white/75">{s.projectName}</p>
            <p className="mt-10 text-[12px] text-white/55">Version {version} · snapshot taken {formatDateTime(createdAt)}</p>
          </div>
        </header>
      )}
      <div className="px-8 md:px-16">
        {on("executive") && (
          <Section id="executive" n={++n}>
            <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
              <div className="space-y-4 text-[16px] leading-relaxed">
                {s.executiveSummary.research ? <p>{s.executiveSummary.research}</p> : <p className="text-muted">No completed research run is included in this report.</p>}
                {s.executiveSummary.selectedDirection && <p><b className="font-medium">Recommended direction — </b>{s.executiveSummary.selectedDirection}</p>}
              </div>
              <div className="space-y-4 text-[13px]">
                {s.executiveSummary.opportunities.length > 0 && <div><p className="cc-eyebrow text-muted">Opportunities (hypotheses)</p><ul className="mt-2 space-y-1">{s.executiveSummary.opportunities.map((o) => <li key={o}>— {o}</li>)}</ul></div>}
                {s.executiveSummary.experiments.length > 0 && <div><p className="cc-eyebrow text-muted">Experiments</p><ul className="mt-2 space-y-1">{s.executiveSummary.experiments.map((o) => <li key={o}>— {o}</li>)}</ul></div>}
              </div>
            </div>
          </Section>
        )}
        {on("brief") && (
          <Section id="brief" n={++n}>
            <dl className="grid gap-x-8 gap-y-4 text-[14px] md:grid-cols-2">
              {[["Brand", s.brief.brand], ["Product", s.brief.product], ["Category", s.brief.category], ["Market", s.brief.market], ["Audience", s.brief.audience], ["Objective", s.brief.objective], ["Existing positioning", s.brief.existingPositioning], ["Competitors", s.brief.competitors.join(", ")], ["Timeframe", s.brief.timeframe], ["Budget", s.brief.budgetRange]].map(([k, v]) => (
                <div key={k as string}><dt className="text-[11px] uppercase tracking-wider text-muted">{k as string}</dt><dd className="mt-1">{(v as string) || "—"}</dd></div>
              ))}
            </dl>
            <p className="mt-4 text-[12px] text-faint">Brief revision {String(s.brief.revision)}.</p>
          </Section>
        )}
        {on("methodology") && (
          <Section id="methodology" n={++n}>
            {s.methodology ? (
              <div className="space-y-3 text-[14px] leading-relaxed">
                <p><b className="font-medium">Research question.</b> {s.methodology.question}</p>
                <p><b className="font-medium">Data.</b> {s.methodology.mode === "demo" ? "Demonstration fixtures (not live data)." : `Qloo Insights API, queried ${formatDateTime(s.methodology.runAt)}.`} Signals: {s.methodology.signals.join(", ") || "none"}{s.methodology.location ? `; location “${s.methodology.location}”` : ""}. {s.methodology.requests} provider requests ({s.methodology.failedRequests} failed).</p>
                <p><b className="font-medium">Interpretation.</b> {s.methodology.interpretationBy}. Positioning: {s.strategyGeneratedBy ?? "not generated"}.</p>
                <ul className="list-disc pl-5 text-[13px] text-muted">{s.methodology.notes.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ) : <p className="text-muted">No research run.</p>}
          </Section>
        )}
        {on("landscape") && (
          <Section id="landscape" n={++n}>
            {s.landscape.length === 0 ? <p className="text-muted">No entities were returned.</p> : (
              <div className="grid gap-6 md:grid-cols-2">
                {s.landscape.map((g) => (
                  <div key={g.type} className="break-inside-avoid">
                    <p className="cc-eyebrow text-muted">{g.type}</p>
                    <ul className="mt-3 space-y-2">
                      {g.items.map((it) => (
                        <li key={it.name} className="grid grid-cols-[1fr_120px_44px] items-center gap-3 text-[13px]">
                          <span className="truncate">{it.name}</span>
                          <span className="h-1.5 rounded-full bg-ink/5"><span className="block h-1.5 rounded-full bg-violet" style={{ width: `${Math.max(0, Math.min(1, it.affinity ?? 0)) * 100}%` }} /></span>
                          <span className="text-right tabular-nums text-muted">{it.affinity?.toFixed(2) ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-6 text-[12px] text-muted">Bars show the affinity value returned by the provider (0–1). Affinity describes taste correlation, not purchase intent or causation.</p>
          </Section>
        )}
        {on("evidence") && (
          <Section id="evidence" n={++n}>
            {s.findings.length > 0 && (
              <ul className="mb-6 space-y-2 text-[14px]">
                {s.findings.map((f, i) => <li key={i} className="flex gap-3"><span className={cn("mt-1.5 h-3 w-0.5 shrink-0", f.kind === "observation" ? "bg-ink" : "bg-violet")} /><span><span className="text-[11px] uppercase tracking-wider text-muted">{f.kind === "observation" ? "Observed" : "AI interpretation"} · </span>{f.statement}</span></li>)}
              </ul>
            )}
            <ol className="space-y-2 text-[13px]">
              {s.evidence.slice(0, 25).map((e, i) => (
                <li key={e.id} className="grid grid-cols-[36px_1fr] gap-2"><span className="tabular-nums text-faint">[{i + 1}]</span><span>{e.claim} <span className="text-[11px] text-muted">— {EVIDENCE_LABEL[e.type]?.label ?? e.type}{e.review !== "unreviewed" ? `, ${e.review.replace("_", " ")}` : ""}</span></span></li>
              ))}
            </ol>
          </Section>
        )}
        {on("opportunities") && (
          <Section id="opportunities" n={++n}>
            {s.opportunities.length === 0 ? <p className="text-muted">No opportunities recorded.</p> : (
              <div className="grid gap-5 md:grid-cols-2">
                {s.opportunities.map((o) => (
                  <div key={o.title} className="break-inside-avoid rounded-cc-lg border border-line bg-paper p-5">
                    <p className="cc-eyebrow text-[10px] text-muted">Hypothesis · {o.status}</p>
                    <h3 className="mt-1 font-serif text-2xl">{o.title}{cite(o.evidenceIds)}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed">{o.description}</p>
                    {o.unknowns && <p className="mt-2 text-[12px] text-muted"><b className="font-medium">Unknown:</b> {o.unknowns}</p>}
                    {o.validation && <p className="mt-1 text-[12px] text-muted"><b className="font-medium">Validate by:</b> {o.validation}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
        {on("directions") && (
          <Section id="directions" n={++n}>
            {s.directions.length === 0 ? <p className="text-muted">No positioning directions generated.</p> : (
              <div className="space-y-6">
                {s.directions.map((d, i) => (
                  <div key={d.name} className="break-inside-avoid grid gap-4 md:grid-cols-[200px_1fr]">
                    <div><p className="font-mono text-[11px] text-faint">Direction 0{i + 1}{d.selected ? " · selected" : ""}{d.exploratory ? " · exploratory" : ""}</p><h3 className="mt-1 font-serif text-2xl">{d.name}</h3></div>
                    <div className="space-y-2 text-[13px] leading-relaxed">
                      <p className="font-serif text-[18px]">“{d.content.positioningStatement}”{cite(d.content.evidenceIds)}</p>
                      <p><b className="font-medium">Rationale.</b> {d.content.strategicRationale}</p>
                      <p><b className="font-medium">Trade-offs.</b> {d.content.tradeOffs}</p>
                      <p className="text-muted"><b className="font-medium">Uncertainties.</b> {d.content.uncertainties}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
        {on("selected") && (
          <Section id="selected" n={++n}>
            {s.selected ? (
              <div className="space-y-4">
                <h3 className="font-serif text-4xl">{s.selected.name}</h3>
                <p className="text-[16px] leading-relaxed">{s.selected.content.coreIdea}</p>
                <div className="grid gap-4 text-[13px] md:grid-cols-2">
                  <div><p className="cc-eyebrow text-muted">Messaging pillars</p><ul className="mt-2 space-y-1">{s.selected.content.messagingPillars.map((p) => <li key={p}>— {p}</li>)}</ul></div>
                  <div><p className="cc-eyebrow text-muted">Assumptions to test</p><ul className="mt-2 space-y-1">{s.selected.content.assumptionsToTest.map((p) => <li key={p}>— {p}</li>)}</ul></div>
                </div>
              </div>
            ) : <p className="text-muted">No direction has been selected.</p>}
          </Section>
        )}
        {on("creative") && (
          <Section id="creative" n={++n}>
            {s.creativeBrief ? (
              <dl className="space-y-4 text-[14px]">
                {CREATIVE_SECTIONS.map(([k, label]) => <div key={k} className="grid gap-2 md:grid-cols-[200px_1fr]"><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap leading-relaxed">{s.creativeBrief!.content[k]}</dd></div>)}
                <p className="text-[12px] text-faint">{s.creativeBrief.generatedBy} · revision {s.creativeBrief.revision}</p>
              </dl>
            ) : <p className="text-muted">No creative brief yet.</p>}
          </Section>
        )}
        {on("experiments") && (
          <Section id="experiments" n={++n}>
            {s.experiments.length === 0 ? <p className="text-muted">No experiments planned.</p> : (
              <div className="space-y-6">
                {s.experiments.map((x) => (
                  <div key={x.name} className="break-inside-avoid rounded-cc-lg border border-line bg-paper p-5 text-[13px]">
                    <p className="cc-eyebrow text-[10px] text-muted">{x.status} · {x.method ?? "method not set"}</p>
                    <h3 className="mt-1 font-serif text-2xl">{x.name}</h3>
                    <p className="mt-2">Hypothesis: “{x.hypothesis}”</p>
                    <p className="mt-1 text-muted">Primary metric: {x.primaryMetric}{x.threshold ? ` · decision threshold: ${x.threshold}` : ""}</p>
                    {x.results.length > 0 && (
                      <table className="mt-3 w-full text-left text-[12px]"><thead className="text-muted"><tr><th className="font-medium">Variant</th><th className="font-medium">Metric</th><th className="text-right font-medium">Observed</th><th className="text-right font-medium">n</th></tr></thead>
                        <tbody>{x.results.map((r, i) => <tr key={i} className="border-t border-line"><td>{r.variant ?? "All"}</td><td>{r.metric}</td><td className="text-right tabular-nums">{r.value}</td><td className="text-right tabular-nums">{r.n ?? "—"}</td></tr>)}</tbody></table>
                    )}
                    {x.interpretation && <p className="mt-2"><b className="font-medium">Team interpretation:</b> {x.interpretation}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
        {on("limitations") && (
          <Section id="limitations" n={++n}>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px]">{s.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            {s.openQuestions.length > 0 && <><p className="mt-6 cc-eyebrow text-muted">Open questions</p><ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">{s.openQuestions.map((q) => <li key={q}>{q}</li>)}</ul></>}
          </Section>
        )}
        {on("sources") && (
          <Section id="sources" n={++n} className="pb-16">
            <p className="text-[13px] text-muted">Evidence references [n] correspond to the numbered list in Key evidence.</p>
            <ol className="mt-4 space-y-1.5 text-[12px]">
              {s.evidence.map((e, i) => (
                <li key={e.id} className="grid grid-cols-[36px_1fr] gap-2"><span className="tabular-nums text-faint">[{i + 1}]</span>
                  <span>{e.source ?? "—"}{e.ref ? ` · ref ${e.ref}` : ""}{e.retrievedAt ? ` · retrieved ${formatDate(e.retrievedAt)}` : ""}{e.url && <> · <a href={e.url} className="break-all text-violet underline" rel="noopener noreferrer nofollow">{e.url}</a></>}</span></li>
              ))}
            </ol>
            {s.sources.length > 0 && (
              <><p className="mt-8 cc-eyebrow text-muted">Provider requests</p>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted">{s.sources.map((x, i) => <li key={i}>{formatDateTime(x.retrievedAt)} · {x.endpoint} · {Object.entries(x.params).map(([k, v]) => `${k}=${v}`).join("&").slice(0, 140)} · {x.status}{x.httpStatus ? ` ${x.httpStatus}` : ""} · {x.results} results</li>)}</ul></>
            )}
          </Section>
        )}
      </div>
    </article>
  );
}
