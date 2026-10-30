"use client";

import Link from "next/link";
import { Popover } from "radix-ui";
import * as React from "react";
import { EVIDENCE_LABEL } from "@/lib/evidence-labels";
import { cn, formatDate } from "@/lib/utils";

export type Receipt = { id: string; claim: string; type: string; source: string | null; url: string | null; retrievedAt: string | null };
export type ReceiptClaim = { statement: string; evidenceIds: string[]; support?: "verified" | "weak" | "uncited" };

const SUPPORT: Record<NonNullable<ReceiptClaim["support"]>, { label: string; className: string }> = {
  verified: { label: "Verified against its source", className: "decoration-ink/30" },
  weak: { label: "Weakly supported — the cited source doesn't state this", className: "decoration-peach decoration-dashed" },
  uncited: { label: "AI interpretation — no source cited", className: "decoration-violet/50 decoration-dotted" },
};

/** Highlights the words a statement shares with its source, so a reader sees what backs it. */
function highlight(text: string, statement: string) {
  const words = new Set((statement.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]{2,}/gu) ?? []).map((w) => w.replace(/[.]$/, "")));
  return text.split(/([\p{L}\p{N}][\p{L}\p{N}'’.-]{2,})/u).map((part, i) =>
    words.has(part.toLowerCase().replace(/[.]$/, "")) ? <mark key={i} className="rounded-sm bg-lilac/70 px-0.5 text-ink">{part}</mark> : part);
}

/** A numbered citation chip that opens the exact stored evidence behind it. */
export function ReceiptChip({ receipt, n, statement, projectId }: { receipt: Receipt | undefined; n: number | string; statement: string; projectId?: string }) {
  if (!receipt) return <sup className="ml-0.5 text-faint">[{n}]</sup>;
  const label = EVIDENCE_LABEL[receipt.type]?.label ?? receipt.type;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="ml-0.5 align-super text-[0.7em] font-medium text-violet hover:underline focus-visible:outline-2 focus-visible:outline-violet" aria-label={`Evidence ${n}: open receipt`}>
          [{n}]
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={16}
          className="z-50 w-[min(380px,calc(100vw-32px))] rounded-cc border border-line bg-paper p-4 text-left text-[13px] leading-relaxed text-ink shadow-[0_24px_60px_-20px_rgba(17,17,22,0.35)] data-[state=open]:animate-[cc-scale-in_.2s_var(--cc-ease-out)]">
          <p className="cc-eyebrow text-[10px] text-muted">Evidence receipt · {label}</p>
          <blockquote className="mt-2 border-l-2 border-violet pl-3">{highlight(receipt.claim, statement)}</blockquote>
          <p className="mt-3 text-[11px] text-muted">
            {receipt.source ?? "Source not recorded"}{receipt.retrievedAt ? ` · retrieved ${formatDate(receipt.retrievedAt)}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
            {projectId && <Link className="text-violet underline-offset-2 hover:underline" href={`/projects/${projectId}/evidence/${receipt.id}`}>Open evidence</Link>}
            {receipt.url && <a className="break-all text-violet underline-offset-2 hover:underline" href={receipt.url} target="_blank" rel="noopener noreferrer nofollow">Original source ↗</a>}
          </div>
          <Popover.Arrow className="fill-paper" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The statements an item rests on, each marked by how well its citations hold up. */
export function ClaimList({ claims, receipts, numbers, projectId, className }: {
  claims: ReceiptClaim[]; receipts: Record<string, Receipt>; numbers?: Record<string, number>; projectId?: string; className?: string;
}) {
  if (!claims.length) return null;
  const order = new Map<string, number>();
  const numberOf = (id: string) => numbers?.[id] ?? (order.get(id) ?? order.set(id, order.size + 1).get(id)!);
  return (
    <ul className={cn("space-y-1.5", className)}>
      {claims.map((c, i) => {
        const s = SUPPORT[c.support ?? (c.evidenceIds.length ? "weak" : "uncited")];
        return (
          <li key={i} className="flex gap-2">
            <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", c.support === "verified" ? "bg-ink" : c.support === "weak" ? "bg-peach" : "bg-violet/60")} />
            <span>
              <span className={cn("underline underline-offset-4", s.className)} title={s.label}>{c.statement}</span>
              {c.evidenceIds.map((id) => <ReceiptChip key={id} receipt={receipts[id]} n={numberOf(id)} statement={c.statement} projectId={projectId} />)}
              {c.support && c.support !== "verified" && <span className="ml-1.5 text-[11px] text-muted">({c.support === "weak" ? "weakly supported" : "interpretation"})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "4 of 5 statements verified": how much of an item is backed by sources it actually cites. */
export function GroundingScore({ claims, tone = "light" }: { claims: ReceiptClaim[] | undefined; tone?: "light" | "dark" }) {
  if (!claims?.length) return null;
  const verified = claims.filter((c) => c.support === "verified").length;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", tone === "dark" ? "bg-white/15 text-white" : "bg-ink/5 text-ink")}
      title="Statements whose cited evidence contains what they say">
      Grounding {verified}/{claims.length} verified
    </span>
  );
}
