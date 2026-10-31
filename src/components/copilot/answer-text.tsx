import * as React from "react";

/**
 * The light markdown the copilot writes (paragraphs, "- " and "1. " lists, # headings, **bold**,
 * `code`) as React elements. Never parsed into HTML, so model text can't inject markup.
 * Live Qloo refs like [Q3] or [Q12–Q17] become small tags.
 */
export function AnswerText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      blocks.push(list.ordered
        ? <ol key={blocks.length} className="list-decimal space-y-0.5 pl-5">{items}</ol>
        : <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">{items}</ul>);
    }
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    // "# Title" or a line that is bold on its own ("**How they differ**") reads as a heading.
    const heading = /^#{1,6}\s+(.*)$/.exec(line) ?? /^\*\*([^*]+)\*\*:?$/.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(<p key={blocks.length} className="font-semibold">{inline(heading[1])}</p>);
    } else if (list && /^\s{2,}/.test(raw)) {
      // An indented line continues the previous list item.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[Q\d+(?:\s*[–-]\s*Q?\d+)?(?:\s*,\s*Q\d+(?:\s*[–-]\s*Q?\d+)?)*\])/g;

function inline(s: string): React.ReactNode[] {
  return s.split(TOKEN).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i} className="rounded bg-paper px-1 font-mono text-[12px]">{part.slice(1, -1)}</code>;
    if (/^\[Q\d/.test(part)) return <span key={i} className="ml-0.5 rounded-full bg-lilac/60 px-1.5 py-px align-[1px] text-[10px] font-medium text-violet" title="Live Qloo result, listed under “Live from Qloo”">{part.slice(1, -1)}</span>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
