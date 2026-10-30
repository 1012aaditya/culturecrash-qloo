import "server-only";
import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// Keep words whole: editorial titles should never be auto-hyphenated.
Font.registerHyphenationCallback((word) => [word]);
// Cards that can run longer than a page (directions with their claims, creative-brief sections,
// experiments) are allowed to break across pages; wrap={false} clipped them. Only short rows keep it.
import { CREATIVE_SECTIONS } from "@/lib/ai/schemas";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { REPORT_SECTIONS, type ReportSnapshot } from "./types";

const C = { ink: "#111116", muted: "#696774", line: "#E9E5E1", violet: "#5b3fd6", peach: "#FFE3D7", paper: "#FBFAF7" };
const st = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 60, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 10, color: C.ink, backgroundColor: C.paper, lineHeight: 1.45 },
  cover: { padding: 0, backgroundColor: "#17151E", color: "#fff" },
  coverInner: { flex: 1, padding: 64, justifyContent: "space-between" },
  eyebrow: { fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: C.muted },
  h1: { fontFamily: "Times-Roman", fontSize: 48, lineHeight: 1 },
  h2: { fontFamily: "Times-Roman", fontSize: 26, marginBottom: 12, marginTop: 2 },
  h3: { fontFamily: "Times-Roman", fontSize: 15, marginBottom: 4 },
  num: { fontSize: 8, color: C.muted, fontFamily: "Courier" },
  section: { marginBottom: 22 },
  p: { marginBottom: 6 },
  small: { fontSize: 8.5, color: C.muted },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3 },
  card: { borderWidth: 0.5, borderColor: C.line, borderRadius: 6, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  demo: { backgroundColor: C.peach, color: "#8a3d22", padding: 8, borderRadius: 4, marginBottom: 14, fontSize: 9 },
  footer: { position: "absolute", bottom: 26, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  bar: { height: 4, backgroundColor: C.line, borderRadius: 2, width: 90, marginTop: 4 },
});
const title = Object.fromEntries(REPORT_SECTIONS);

function Sec({ k, n, children }: { k: string; n: number; children: React.ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.num}>{String(n).padStart(2, "0")}</Text>
      <Text style={st.h2}>{title[k]}</Text>
      {children}
    </View>
  );
}

function ReportPdf({ s, version, createdAt, pageNumbers, images }: { s: ReportSnapshot; version: number; createdAt: string; pageNumbers: boolean; images: Map<string, Buffer> }) {
  const on = (k: string) => s.sections.includes(k as never);
  // Citations use the numbering of the Key evidence list.
  const evIndex = new Map(s.evidence.map((e, i) => [e.id, i + 1]));
  const refs = (ids: string[] | undefined) => {
    const ns = (ids ?? []).map((id) => evIndex.get(id)).filter(Boolean);
    return ns.length ? ` [${ns.join(", ")}]` : "";
  };
  const claimLine = (c: { statement: string; evidenceIds: string[]; support?: string }) =>
    `${c.support === "verified" ? "•" : c.support === "weak" ? "- (weakly supported)" : "- (interpretation)"} ${c.statement}${refs(c.evidenceIds)}`;
  let n = 0;
  const date = new Date(createdAt).toISOString().slice(0, 10);
  return (
    <Document title={s.title} author="CultureCrash" subject={s.projectName}>
      {on("cover") && (
        <Page size="A4" style={st.cover}>
          <View style={st.coverInner}>
            <Text style={[st.eyebrow, { color: "#B8A5FF" }]}>{s.clientName ?? "CultureCrash"} · Cultural strategy report</Text>
            <View>
              <Text style={[st.h1, { color: "#fff" }]}>{s.title}</Text>
              <Text style={{ marginTop: 12, color: "#cfcbd8", fontSize: 12 }}>{s.projectName}</Text>
              {s.containsDemoData && <Text style={{ marginTop: 18, color: "#FFC7B1" }}>Contains DEMONSTRATION DATA built from fixture records. Not research.</Text>}
            </View>
            <Text style={{ color: "#8e8a99", fontSize: 9 }}>Version {version} · snapshot {date}</Text>
          </View>
        </Page>
      )}
      <Page size="A4" style={st.page} wrap>
        {s.containsDemoData && <Text style={st.demo}>DEMONSTRATION DATA: values in this report come from fixture records and must not be presented as research.</Text>}
        {on("executive") && (
          <Sec k="executive" n={++n}>
            <Text style={st.p}>{s.executiveSummary.research ?? "No completed research run is included in this report."}</Text>
            {s.executiveSummary.selectedDirection && <Text style={st.p}>Recommended direction: {s.executiveSummary.selectedDirection}</Text>}
            {s.executiveSummary.opportunities.map((o) => <Text key={o} style={st.small}>• Opportunity (hypothesis): {o}</Text>)}
          </Sec>
        )}
        {on("brief") && (
          <Sec k="brief" n={++n}>
            {[["Brand", s.brief.brand], ["Product", s.brief.product], ["Category", s.brief.category], ["Market", s.brief.market], ["Audience", s.brief.audience], ["Objective", s.brief.objective], ["Existing positioning", s.brief.existingPositioning], ["Competitors", s.brief.competitors.join(", ")]].map(([k, v]) => (
              <View key={k as string} style={st.row} wrap={false}><Text style={{ width: 120, color: C.muted }}>{k as string}</Text><Text style={{ flex: 1 }}>{(v as string) || "-"}</Text></View>
            ))}
          </Sec>
        )}
        {on("methodology") && (
          <Sec k="methodology" n={++n}>
            {s.methodology ? (
              <>
                <Text style={st.p}>Question: {s.methodology.question}</Text>
                <Text style={st.p}>Data: {s.methodology.mode === "demo" ? "demonstration fixtures (not live data)" : `Qloo Insights API, ${s.methodology.runAt.slice(0, 10)}`}. Signals: {s.methodology.signals.join(", ") || "none"}{s.methodology.location ? `; location ${s.methodology.location}` : ""}. {s.methodology.requests} provider requests ({s.methodology.failedRequests} failed).</Text>
                <Text style={st.p}>Interpretation: {s.methodology.interpretationBy}. Positioning: {s.strategyGeneratedBy ?? "not generated"}.</Text>
              </>
            ) : <Text>No research run.</Text>}
          </Sec>
        )}
        {on("landscape") && (
          <Sec k="landscape" n={++n}>
            {s.landscape.map((g) => (
              <View key={g.type} style={{ marginBottom: 8 }} wrap={false}>
                <Text style={[st.eyebrow, { marginBottom: 3 }]}>{g.type}</Text>
                {g.items.map((it) => (
                  <View key={it.name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    <Text style={{ flex: 1 }}>{it.name}</Text>
                    <View style={st.bar}><View style={{ height: 4, borderRadius: 2, backgroundColor: C.violet, width: 90 * Math.max(0, Math.min(1, it.affinity ?? 0)) }} /></View>
                    <Text style={{ width: 34, textAlign: "right", color: C.muted }}>{it.affinity?.toFixed(2) ?? "-"}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Text style={st.small}>Affinity (0-1) as returned by the provider. It describes taste correlation, not purchase intent or causation.</Text>
          </Sec>
        )}
        {on("evidence") && (
          <Sec k="evidence" n={++n}>
            {s.findings.map((f, i) => <Text key={i} style={st.p}>{f.kind === "observation" ? "Observed: " : "AI interpretation: "}{f.statement}{refs(f.evidenceIds)}</Text>)}
            {s.evidence.map((e, i) => <Text key={e.id} style={st.small}>[{i + 1}] {e.claim} ({EVIDENCE_LABEL[e.type]?.label ?? e.type})</Text>)}
          </Sec>
        )}
        {on("opportunities") && (
          <Sec k="opportunities" n={++n}>
            {s.opportunities.length === 0 && <Text>No opportunities recorded.</Text>}
            {s.opportunities.map((o) => (
              <View key={o.title} style={st.card}>
                <Text style={st.h3}>{o.title}</Text>
                <Text style={st.p}>{o.description}{o.claims?.length ? "" : refs(o.evidenceIds)}</Text>
                {o.claims?.map((c, j) => <Text key={j} style={st.small}>{claimLine(c)}</Text>)}
                {o.unknowns && <Text style={st.small}>Unknown: {o.unknowns}</Text>}
                {o.validation && <Text style={st.small}>Validate by: {o.validation}</Text>}
              </View>
            ))}
          </Sec>
        )}
        {on("directions") && (
          <Sec k="directions" n={++n}>
            {s.directions.map((d, i) => (
              <View key={d.name} style={st.card}>
                <Text style={st.num}>Direction 0{i + 1}{d.selected ? " · selected" : ""}{d.exploratory ? " · exploratory" : ""}</Text>
                <Text style={st.h3}>{d.name}</Text>
                <Text style={[st.p, { fontFamily: "Times-Italic", fontSize: 11 }]}>{d.content.positioningStatement}{d.content.claims?.length ? "" : refs(d.content.evidenceIds)}</Text>
                {d.content.claims?.length ? <Text style={st.small}>Grounding: {d.content.claims.filter((c) => c.support === "verified").length} of {d.content.claims.length} statements verified against their sources</Text> : null}
                {d.content.claims?.map((c, j) => <Text key={j} style={st.small}>{claimLine(c)}</Text>)}
                <Text style={st.p}>Rationale: {d.content.strategicRationale}</Text>
                <Text style={st.small}>Trade-offs: {d.content.tradeOffs}</Text>
                <Text style={st.small}>Uncertainties: {d.content.uncertainties}</Text>
              </View>
            ))}
          </Sec>
        )}
        {on("selected") && (
          <Sec k="selected" n={++n}>
            {s.selected ? (
              <>
                <Text style={st.h3}>{s.selected.name}</Text>
                <Text style={st.p}>{s.selected.content.coreIdea}</Text>
                {s.selected.content.messagingPillars.map((p) => <Text key={p}>• {p}</Text>)}
              </>
            ) : <Text>No direction selected.</Text>}
          </Sec>
        )}
        {on("objections") && (
          <Sec k="objections" n={++n}>
            {s.objections ? (
              <>
                <Text style={st.p}>{s.objections.verdict}: {s.objections.summary}</Text>
                {s.objections.items.map((o) => (
                  <View key={o.direction} style={st.card}>
                    <Text style={st.h3}>{o.direction}</Text>
                    <Text style={st.p}>Objection: {o.objection}</Text>
                    {o.weakestEvidence ? <Text style={st.small}>Weakest evidence: {o.weakestEvidence}</Text> : null}
                    {o.competitor ? <Text style={st.small}>Who already owns this: {o.competitor}</Text> : null}
                    <Text style={st.small}>Toughest question: {o.question}</Text>
                    <Text style={st.p}>Our answer: {o.answer}</Text>
                  </View>
                ))}
              </>
            ) : <Text>No Devil&apos;s Advocate review has been run on this strategy version.</Text>}
          </Sec>
        )}
        {on("creative") && (
          <Sec k="creative" n={++n}>
            {s.creativeBrief ? CREATIVE_SECTIONS.map(([k, label]) => (
              <View key={k} style={{ marginBottom: 6 }}><Text style={{ fontFamily: "Helvetica-Bold" }}>{label}</Text><Text>{s.creativeBrief!.content[k]}</Text>
                {s.creativeBrief!.grounding?.filter((g) => g.section === k).map((c, j) => <Text key={j} style={st.small}>{claimLine(c)}</Text>)}</View>
            )) : <Text>No creative brief.</Text>}
          </Sec>
        )}
        {on("visual") && (
          <Sec k="visual" n={++n}>
            {s.visualWorld ? <VisualWorldPdf v={s.visualWorld} images={images} /> : <Text>{s.visualWorld === undefined ? "This report version was created before boards could be included." : "No inspiration board is linked to the selected direction."}</Text>}
          </Sec>
        )}
        {on("futures") && (
          <Sec k="futures" n={++n}>
            {s.visualFutures ? <VisualFuturesPdf v={s.visualFutures} images={images} /> : <Text>{s.visualFutures === undefined ? "This report version was created before visual futures existed." : "No AI concept frames have been made for these directions yet."}</Text>}
          </Sec>
        )}
        {on("experiments") && (
          <Sec k="experiments" n={++n}>
            {s.experiments.length === 0 && <Text>No experiments planned.</Text>}
            {s.experiments.map((x) => (
              <View key={x.name} style={st.card}>
                <Text style={st.h3}>{x.name} ({x.status})</Text>
                <Text style={st.p}>Hypothesis: {x.hypothesis}</Text>
                <Text style={st.small}>Method: {x.method ?? "-"} · Primary metric: {x.primaryMetric}{x.threshold ? ` · Threshold: ${x.threshold}` : ""}</Text>
                {x.results.map((r, i) => <Text key={i} style={st.small}>Observed: {r.variant ?? "All"} · {r.metric} = {r.value}{r.n !== null ? ` (n=${r.n})` : ""}</Text>)}
                {x.interpretation && <Text style={st.p}>Team interpretation: {x.interpretation}</Text>}
              </View>
            ))}
          </Sec>
        )}
        {on("limitations") && (
          <Sec k="limitations" n={++n}>
            {s.limitations.map((l) => <Text key={l} style={st.p}>• {l}</Text>)}
            {s.openQuestions.map((q) => <Text key={q} style={st.small}>? {q}</Text>)}
          </Sec>
        )}
        {on("sources") && (
          <Sec k="sources" n={++n}>
            {s.evidence.map((e, i) => (
              <Text key={e.id} style={st.small}>[{i + 1}] {e.source ?? "-"}{e.ref ? ` · ref ${e.ref}` : ""}{e.retrievedAt ? ` · retrieved ${e.retrievedAt.slice(0, 10)}` : ""}{e.url ? " · " : ""}{e.url && <Link src={e.url}>{e.url}</Link>}</Text>
            ))}
            {s.sources.map((x, i) => <Text key={i} style={[st.small, { fontFamily: "Courier", fontSize: 7 }]}>{x.retrievedAt.slice(0, 19)} {x.endpoint} {x.status} {x.results} results</Text>)}
          </Sec>
        )}
        <View style={st.footer} fixed>
          <Text>{s.title} · v{version}</Text>
          {pageNumbers && <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />}
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(s: ReportSnapshot, version: number, createdAt: string, images: Map<string, Buffer> = new Map()) {
  try {
    return await renderToBuffer(<ReportPdf s={s} version={version} createdAt={createdAt} pageNumbers images={images} />);
  } catch (e) {
    // react-pdf 4.9 bug: for some page layouts, re-laying out `render` (page number) nodes leaves a child
    // unpositioned and pdfkit throws "unsupported number: -1.9e21". Retry without page numbers.
    if (!(e instanceof Error && e.message.startsWith("unsupported number"))) throw e;
    return renderToBuffer(<ReportPdf s={s} version={version} createdAt={createdAt} pageNumbers={false} images={images} />);
  }
}

const RIGHTS = { reference: "Reference only · not for publication", licensed: "Licensed", own: "Own asset", ai: "AI concept · not final artwork" } as const;

const FIT: Record<string, string> = { strong: "Strong fit", partial: "Partial fit", off: "Off-taste", unknown: "Not judged" };

function VisualFuturesPdf({ v, images }: { v: NonNullable<ReportSnapshot["visualFutures"]>; images: Map<string, Buffer> }) {
  return (
    <View>
      <Text style={st.p}>The same audience, three possible campaigns: AI concept frames made from each direction’s idea, its cultural connections and the audience’s Qloo taste signals. Fit is an AI hypothesis, not evidence of performance.</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {v.directions.map((d) => (
          <View key={d.slot} style={{ width: "31.5%" }} wrap={false}>
            <Text style={st.eyebrow}>Direction 0{d.slot}{d.selected ? " · selected" : ""}</Text>
            <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 2, marginBottom: 5 }}>{d.name}</Text>
            {d.frames.length === 0 && <Text style={st.small}>No frames yet.</Text>}
            {d.frames.map((f) => {
              const data = images.get(f.thumbPath);
              return (
                <View key={f.path} style={{ marginBottom: 8 }}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the caption below names the frame */}
                  {data ? <Image src={{ data, format: "jpg" }} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 4 }} /> : (
                    <View style={{ height: 150, borderRadius: 4, backgroundColor: "#F2EFEA", justifyContent: "center", padding: 6 }}><Text style={[st.small, { textAlign: "center" }]}>{f.title}</Text></View>
                  )}
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 3 }}>{f.title}</Text>
                  <Text style={st.small}>{f.fit ? FIT[f.fit] ?? f.fit : "Fit not checked"}{f.improved ? " · improved by the AI art director" : ""}</Text>
                  <Text style={[st.small, { color: "#8a3d22" }]}>{RIGHTS.ai}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function VisualWorldPdf({ v, images }: { v: NonNullable<ReportSnapshot["visualWorld"]>; images: Map<string, Buffer> }) {
  return (
    <View>
      <Text style={st.p}>From the inspiration board “{v.boardName}” ({v.cardCount} cards).{v.coverage.sourceable > 0 ? ` ${v.coverage.sourced} of ${v.coverage.sourceable} references carry a source.` : ""}</Text>
      {v.palette.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }} wrap={false}>
          {v.palette.map((c) => (
            <View key={c.hex} style={{ flexDirection: "row", alignItems: "center", marginRight: 14, marginBottom: 4 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c.hex, borderWidth: 0.5, borderColor: C.line, marginRight: 5 }} />
              <Text style={{ fontSize: 8.5 }}>{c.name} <Text style={{ fontFamily: "Courier", color: C.muted }}>{c.hex}</Text></Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {v.images.map((img) => {
          const data = images.get(img.thumbPath ?? img.path) ?? images.get(img.path);
          return (
            <View key={img.path} style={{ width: "31.5%", marginBottom: 10 }} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the caption below names the image */}
              {data ? <Image src={{ data, format: "jpg" }} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 4 }} /> : (
                <View style={{ height: 110, borderRadius: 4, backgroundColor: "#F2EFEA", justifyContent: "center", padding: 6 }}><Text style={[st.small, { textAlign: "center" }]}>{img.alt || img.title || "Image unavailable"}</Text></View>
              )}
              {img.title ? <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 3 }}>{img.title}</Text> : null}
              <Text style={[st.small, img.rights === "reference" || img.rights === "ai" ? { color: "#8a3d22" } : {}]}>{RIGHTS[img.rights]}</Text>
              {img.sourceUrl ? <Link src={img.sourceUrl} style={[st.small, { color: C.violet }]}>{img.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}</Link> : <Text style={st.small}>No source recorded</Text>}
            </View>
          );
        })}
      </View>
      {v.notes.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={st.eyebrow}>Board notes</Text>
          {v.notes.map((t, i) => <Text key={i} style={[st.p, { marginTop: 4 }]}>{t}</Text>)}
        </View>
      )}
    </View>
  );
}
