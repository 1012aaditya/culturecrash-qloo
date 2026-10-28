"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateStructured, llmConfigured, tag, TEMPLATE_GENERATOR } from "@/lib/ai";
import { briefExtractionSchema, type BriefExtraction } from "@/lib/ai/schemas";
import { templateBriefExtraction } from "@/lib/ai/template";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity, trackEvent } from "./activity";
import { BRIEF_CORE_FIELDS, isUuid } from "./projects";
import { getCtx } from "./workspace";
import { assertCan, ForbiddenError } from "@/lib/permissions";

const text = (max: number) => z.string().max(max).transform((v) => v.trim() || null).nullable();
const briefSchema = z.object({
  brand: text(160), product: text(400), category: text(120), market: text(160), audience: text(2000), objective: text(2000),
  existingPositioning: text(2000), brandGuidelines: text(6000), budgetRange: text(120), timeframe: text(160), additionalContext: text(8000),
  competitors: z.array(z.string().trim().min(1).max(160)).max(20),
  publicUrls: z.array(z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs")).max(20),
});
export type BriefFields = z.input<typeof briefSchema>;

export type SaveResult = { ok: true; revision: number; savedAt: string } | { ok: false; error: string; conflict?: boolean; fieldErrors?: Record<string, string> };

export async function saveBriefAction(projectId: string, baseRevision: number, fields: BriefFields): Promise<SaveResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const parsed = briefSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: "Some fields are invalid.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "brief.edit");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const d = parsed.data;
  const ws = ctx.workspace.workspaceId;
  return withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select id from projects where id = ${projectId} and workspace_id = ${ws}`;
    if (!p) return { ok: false as const, error: "Project not found." };
    const [current] = await tx`select revision, ${tx(BRIEF_CORE_FIELDS.map((f) => f))} from campaign_briefs where project_id = ${projectId} for update`;
    if (current && current.revision !== baseRevision) {
      return { ok: false as const, conflict: true, error: "Someone else saved this brief since you opened it. Reload to see their changes — your unsaved edits are kept in this tab." };
    }
    const wasComplete = current ? BRIEF_CORE_FIELDS.every((f) => current[f]) : false;
    const [row] = await tx`
      insert into campaign_briefs (project_id, workspace_id, brand, product, category, market, audience, objective, existing_positioning, competitors,
        brand_guidelines, budget_range, timeframe, public_urls, additional_context, updated_by, revision)
      values (${projectId}, ${ws}, ${d.brand}, ${d.product}, ${d.category}, ${d.market}, ${d.audience}, ${d.objective}, ${d.existingPositioning}, ${d.competitors},
        ${d.brandGuidelines}, ${d.budgetRange}, ${d.timeframe}, ${d.publicUrls}, ${d.additionalContext}, ${ctx.user.id}, 1)
      on conflict (project_id) do update set brand = excluded.brand, product = excluded.product, category = excluded.category, market = excluded.market,
        audience = excluded.audience, objective = excluded.objective, existing_positioning = excluded.existing_positioning, competitors = excluded.competitors,
        brand_guidelines = excluded.brand_guidelines, budget_range = excluded.budget_range, timeframe = excluded.timeframe, public_urls = excluded.public_urls,
        additional_context = excluded.additional_context, updated_by = excluded.updated_by, revision = campaign_briefs.revision + 1
      returning revision, updated_at`;
    await tx`update projects set category = coalesce(${d.category}, category), market = coalesce(${d.market}, market), updated_at = now() where id = ${projectId}`;
    const nowComplete = BRIEF_CORE_FIELDS.every((f) => (d as Record<string, unknown>)[f]);
    if (nowComplete && !wasComplete) {
      await trackEvent(tx, { workspaceId: ws, userId: ctx.user.id, event: "brief_completed", projectId });
      await logActivity(tx, { workspaceId: ws, actorId: ctx.user.id, projectId, verb: "completed", objectType: "brief", objectId: projectId, summary: "completed the campaign brief’s core fields" });
    }
    return { ok: true as const, revision: row.revision as number, savedAt: new Date(row.updated_at).toISOString() };
  });
}

const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
]);
const MAX_BYTES = 10 * 1024 * 1024;

export type UploadResult = { ok: true; documentId: string; extracted: boolean; textPreview: string | null; stored: boolean } | { ok: false; error: string };

export async function uploadBriefDocumentAction(form: FormData): Promise<UploadResult> {
  const projectId = String(form.get("projectId") ?? "");
  const file = form.get("file");
  if (!isUuid(projectId) || !(file instanceof File)) return { ok: false, error: "Choose a file to upload." };
  if (file.size === 0 || file.size > MAX_BYTES) return { ok: false, error: "Files must be between 1 byte and 10 MB." };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = ALLOWED.get(file.type) ?? (["pdf", "docx", "txt", "md"].includes(ext) ? ext : null);
  if (!kind) return { ok: false, error: "Supported formats: PDF, DOCX, TXT and Markdown." };
  const ctx = await getCtx();
  try {
    assertCan(ctx.workspace.role, "brief.edit");
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // Magic-byte checks: content must match the declared type.
  if (kind === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") return { ok: false, error: "That file is not a valid PDF." };
  if (kind === "docx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) return { ok: false, error: "That file is not a valid DOCX document." };

  let extracted: string | null = null;
  let status: "extracted" | "unsupported" | "failed" = "unsupported";
  try {
    if (kind === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text: t } = await extractText(pdf, { mergePages: true });
      extracted = String(t);
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      extracted = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else {
      extracted = bytes.toString("utf8");
    }
    extracted = extracted.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, 60_000);
    status = extracted ? "extracted" : "failed";
  } catch {
    status = "failed";
    extracted = null;
  }

  let storagePath: string | null = null;
  const e = env();
  if (e.AUTH_MODE === "supabase" && e.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { supabaseServer } = await import("@/lib/auth/supabase");
      const client = await supabaseServer();
      const path = `${ctx.workspace.workspaceId}/${projectId}/${crypto.randomUUID()}.${kind}`;
      const { error } = await client.storage.from(e.SUPABASE_STORAGE_BUCKET).upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
      if (!error) storagePath = path;
    } catch {
      storagePath = null;
    }
  }

  const id = await withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select id from projects where id = ${projectId} and workspace_id = ${ctx.workspace.workspaceId}`;
    if (!p) return null;
    const [doc] = await tx`insert into brief_documents (project_id, workspace_id, file_name, mime_type, size_bytes, storage_path, extracted_text, extraction_status, created_by)
      values (${projectId}, ${ctx.workspace.workspaceId}, ${file.name.slice(0, 200)}, ${file.type || kind}, ${file.size}, ${storagePath}, ${extracted}, ${status}, ${ctx.user.id}) returning id`;
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "uploaded", objectType: "document", objectId: doc.id, summary: `uploaded “${file.name.slice(0, 80)}” to the brief` });
    return doc.id as string;
  });
  if (!id) return { ok: false, error: "Project not found." };
  revalidatePath(`/projects/${projectId}/brief`);
  return { ok: true, documentId: id, extracted: status === "extracted", textPreview: extracted?.slice(0, 400) ?? null, stored: Boolean(storagePath) };
}

export async function deleteBriefDocumentAction(projectId: string, documentId: string) {
  if (!isUuid(projectId) || !isUuid(documentId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "brief.edit");
  await withUser(ctx.user.id, (tx) => tx`delete from brief_documents where id = ${documentId} and project_id = ${projectId}`);
  revalidatePath(`/projects/${projectId}/brief`);
  return { ok: true };
}

export type ExtractResult = { ok: true; proposal: BriefExtraction; generator: string } | { ok: false; error: string };

/** Proposes structured fields from pasted or extracted text. Nothing is saved until the user accepts. */
export async function proposeBriefFieldsAction(projectId: string, sourceText: string): Promise<ExtractResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  const textIn = sourceText.trim().slice(0, 40_000);
  if (textIn.length < 20) return { ok: false, error: "Paste at least a few sentences of brief text." };
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "brief.edit");
  if (!llmConfigured()) return { ok: true, proposal: templateBriefExtraction(textIn), generator: TEMPLATE_GENERATOR };
  try {
    const out = await generateStructured({
      schema: briefExtractionSchema,
      prompt: `Extract campaign brief fields from the document. Use an empty string (or empty list) when a field is not stated. Copy facts; do not infer or invent.\n\n${tag("documents", textIn)}`,
      maxTokens: 4000,
    });
    return { ok: true, proposal: out.data, generator: out.generator };
  } catch {
    return { ok: true, proposal: templateBriefExtraction(textIn), generator: TEMPLATE_GENERATOR };
  }
}
