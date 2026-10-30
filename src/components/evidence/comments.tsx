"use client";

import { Ago } from "@/components/ui/time";
import { useRouter } from "next/navigation";
import * as React from "react";
import { addCommentAction } from "@/lib/data/evidence-actions";
import { Avatar } from "@/components/nav/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

export function Comments({ projectId, targetType, targetId, comments, canComment, path }: {
  projectId: string; targetType: "evidence" | "direction" | "opportunity" | "experiment"; targetId: string; path: string; canComment: boolean;
  comments: { id: string; body: string; author: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <section aria-label="Comments" className="space-y-3">
      <h3 className="text-[13px] font-semibold">Comments ({comments.length})</h3>
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5 text-[13px]">
            <Avatar name={c.author} className="size-7 text-[10px]" />
            <div><p><b className="font-medium">{c.author}</b> <span className="text-[11px] text-faint"><Ago value={c.createdAt} /></span></p><p className="whitespace-pre-wrap text-muted">{c.body}</p></div>
          </li>
        ))}
      </ul>
      {canComment && (
        <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addCommentAction({ projectId, targetType, targetId, body, path }); if (!r.ok) setError(r.error ?? "Failed"); else { setBody(""); setError(null); router.refresh(); } }); }} className="space-y-2">
          <label htmlFor={`c-${targetId}`} className="sr-only">Add a comment</label>
          <Textarea id={`c-${targetId}`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment for your team…" className="min-h-16 text-[13px]" maxLength={4000} />
          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
          <Button size="sm" type="submit" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Comment"}</Button>
        </form>
      )}
    </section>
  );
}
