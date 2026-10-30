export const STAGES = [
  {
    key: "explore",
    number: "01",
    label: "Explore",
    summary: "Understand the audience and the cultural landscape around the brief.",
    detail: "Brief intake, live cultural research, a navigable network of the entities and relationships providers actually return.",
    routes: ["brief", "research"],
  },
  {
    key: "interpret",
    number: "02",
    label: "Interpret",
    summary: "Synthesise evidence and identify opportunities worth investigating.",
    detail: "Evidence ledger, contradictions and gaps, opportunity hypotheses each tied to the observations behind them.",
    routes: ["opportunities", "evidence"],
  },
  {
    key: "create",
    number: "03",
    label: "Create",
    summary: "Develop positioning alternatives, messaging and the creative brief.",
    detail: "Three strategically distinct directions, transparent comparison, versioned edits and an editable creative brief.",
    routes: ["strategy", "creative-brief", "boards"],
  },
  {
    key: "test",
    number: "04",
    label: "Test",
    summary: "Design fair experiments that challenge the riskiest assumptions.",
    detail: "Hypotheses, variants, metrics and decision thresholds agreed before any result comes in.",
    routes: ["experiments"],
  },
  {
    key: "track",
    number: "05",
    label: "Track",
    summary: "Record outcomes, learn, and package the work for clients.",
    detail: "Manual result capture, interpretation kept separate from observation, versioned reports with citations.",
    routes: ["reports"],
  },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export function stageHref(projectId: string, key: StageKey) {
  switch (key) {
    case "explore":
      return `/projects/${projectId}/research`;
    case "interpret":
      return `/projects/${projectId}/opportunities`;
    case "create":
      return `/projects/${projectId}/strategy`;
    case "test":
      return `/projects/${projectId}/experiments`;
    case "track":
      return `/projects/${projectId}/reports`;
  }
}

export function stageForPath(pathname: string): StageKey | null {
  const seg = pathname.split("/")[3];
  if (!seg) return null;
  for (const s of STAGES) if ((s.routes as readonly string[]).includes(seg)) return s.key;
  return null;
}
