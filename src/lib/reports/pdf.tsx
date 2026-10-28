import "server-only";
import { Document, Font, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// Keep words whole: editorial titles should never be auto-hyphenated.
Font.registerHyphenationCallback((word) => [word]);
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

function ReportPdf({ s, version, createdAt }: { s: ReportSnapshot; version: number; createdAt: string }) {
  const on = (k: string) => s.sections.includes(k as never);
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
            {s.findings.map((f, i) => <Text key={i} style={st.p}>{f.kind === "observation" ? "Observed: " : "AI interpretation: "}{f.statement}</Text>)}
            {s.evidence.slice(0, 25).map((e, i) => <Text key={e.id} style={st.small}>[{i + 1}] {e.claim} ({EVIDENCE_LABEL[e.type]?.label ?? e.type})</Text>)}
          </Sec>
        )}
        {on("opportunities") && (
          <Sec k="opportunities" n={++n}>
            {s.opportunities.length === 0 && <Text>No opportunities recorded.</Text>}
            {s.opportunities.map((o) => (
              <View key={o.title} style={st.card} wrap={false}>
                <Text style={st.h3}>{o.title}</Text>
                <Text style={st.p}>{o.description}</Text>
                {o.unknowns && <Text style={st.small}>Unknown: {o.unknowns}</Text>}
                {o.validation && <Text style={st.small}>Validate by: {o.validation}</Text>}
              </View>
            ))}
          </Sec>
        )}
        {on("directions") && (
          <Sec k="directions" n={++n}>
            {s.directions.map((d, i) => (
              <View key={d.name} style={st.card} wrap={false}>
                <Text style={st.num}>Direction 0{i + 1}{d.selected ? " · selected" : ""}{d.exploratory ? " · exploratory" : ""}</Text>
                <Text style={st.h3}>{d.name}</Text>
                <Text style={[st.p, { fontFamily: "Times-Italic", fontSize: 11 }]}>{d.content.positioningStatement}</Text>
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
        {on("creative") && (
          <Sec k="creative" n={++n}>
            {s.creativeBrief ? CREATIVE_SECTIONS.map(([k, label]) => (
              <View key={k} style={{ marginBottom: 6 }} wrap={false}><Text style={{ fontFamily: "Helvetica-Bold" }}>{label}</Text><Text>{s.creativeBrief!.content[k]}</Text></View>
            )) : <Text>No creative brief.</Text>}
          </Sec>
        )}
        {on("experiments") && (
          <Sec k="experiments" n={++n}>
            {s.experiments.length === 0 && <Text>No experiments planned.</Text>}
            {s.experiments.map((x) => (
              <View key={x.name} style={st.card} wrap={false}>
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
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(s: ReportSnapshot, version: number, createdAt: string) {
  return renderToBuffer(<ReportPdf s={s} version={version} createdAt={createdAt} />);
}
