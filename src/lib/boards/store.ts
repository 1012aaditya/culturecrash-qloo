import "server-only";
import { withUser } from "@/lib/db";
import { BOARD_BUCKET, mediaPrefix } from "./data";

/** Stores processed images for a board and registers them. Returns the stored paths in the same order. */
export async function storeImages(userId: string, b: { workspace_id: string; project_id: string }, boardId: string, files: { buf: Buffer; suffix: string; kind: "image" | "thumb" | "preview" }[]) {
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const client = await supabaseServer();
  const base = `${mediaPrefix(b.workspace_id, b.project_id, boardId)}${crypto.randomUUID()}`;
  const paths: string[] = [];
  for (const f of files) {
    const path = `${base}${f.suffix}.webp`;
    const { error } = await client.storage.from(BOARD_BUCKET).upload(path, f.buf, { contentType: "image/webp", upsert: false });
    if (error) throw new Error(`upload failed: ${error.message}`);
    paths.push(path);
  }
  // Registered as unused until a save references them, so abandoned uploads are cleaned up too.
  await withUser(userId, async (tx) => {
    for (const [i, f] of files.entries()) {
      await tx`insert into inspiration_board_media (path, board_id, project_id, workspace_id, kind, bytes, created_by, unused_since)
        values (${paths[i]}, ${boardId}, ${b.project_id}, ${b.workspace_id}, ${f.kind}, ${f.buf.length}, ${userId}, now()) on conflict (path) do nothing`;
    }
  });
  return paths;
}
