"use server";

import { llmEnabled } from "@/lib/ai/enabled";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateStructured, tag, TEMPLATE_GENERATOR } from "@/lib/ai";
import { briefExtractionSchema, type BriefExtraction } from "@/lib/ai/schemas";
import { templateBriefExtraction } from "@/lib/ai/template";
import { withUser } from "@/lib/db";
import { ensureChunks } from "@/lib/research/deep/brand-docs";
import { zipUncompressedBytes } from "@/lib/upload-guards";
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
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
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
      insert into campaign_briefs (project_id, workspace_id, brand, product, category, market, audience, objective, existing_positioning, competitors, interests,
        brand_guidelines, budget_range, timeframe, public_urls, additional_context, updated_by, revision)
      values (${projectId}, ${ws}, ${d.brand}, ${d.product}, ${d.category}, ${d.market}, ${d.audience}, ${d.objective}, ${d.existingPositioning}, ${d.competitors}, ${d.interests},
        ${d.brandGuidelines}, ${d.budgetRange}, ${d.timeframe}, ${d.publicUrls}, ${d.additionalContext}, ${ctx.user.id}, 1)
      on conflict (project_id) do update set brand = excluded.brand, product = excluded.product, category = excluded.category, market = excluded.market,
        audience = excluded.audience, objective = excluded.objective, existing_positioning = excluded.existing_positioning, competitors = excluded.competitors, interests = excluded.interests,
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

import { extractVisualAesthetics, isImageFile } from "@/lib/ai/vision";

const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
const MAX_PDF_PAGES = 300;
const PARSE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("parse timeout")), ms); })])
    .finally(() => clearTimeout(timer));
}

export type UploadResult = { ok: true; documentId: string; extracted: boolean; textPreview: string | null; stored: boolean } | { ok: false; error: string };

function kindOf(name: string, type: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED.get(type) ?? (["pdf", "docx", "txt", "md", "png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? ext : null);
}
const FORMATS = "Supported formats: PDF, DOCX, TXT, Markdown, and Moodboards/Images (PNG, JPG, WEBP, GIF).";
const storageOn = () => { const e = env(); return e.AUTH_MODE === "supabase" && Boolean(e.NEXT_PUBLIC_SUPABASE_URL); };

/**
 * Validates, extracts and records one uploaded file. Shared by the direct form upload (local / small
 * files) and the signed-URL path (Supabase), so both apply exactly the same checks.
 */
async function processDocument(ctx: Awaited<ReturnType<typeof getCtx>>, projectId: string, file: { name: string; type: string; bytes: Buffer }, storagePath: string | null): Promise<UploadResult> {
  const { name, type, bytes } = file;
  const kind = kindOf(name, type);
  if (!kind) return { ok: false, error: FORMATS };
  const isImage = isImageFile(name, type);
  // Magic-byte checks: content must match the declared type.
  if (kind === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") return { ok: false, error: "That file is not a valid PDF." };
  if (kind === "docx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) return { ok: false, error: "That file is not a valid DOCX document." };
  if (kind === "docx") {
    const unzipped = zipUncompressedBytes(bytes);
    if (unzipped === null) return { ok: false, error: "That file is not a valid DOCX document." };
    if (unzipped > MAX_UNZIPPED_BYTES) return { ok: false, error: "That DOCX expands to more than 60 MB, so it was not opened. Save a smaller copy and try again." };
  }

  let extracted: string | null = null;
  let status: "extracted" | "unsupported" | "failed" = "unsupported";
  try {
    if (isImage) {
      // Images go to the vision model only when this workspace allows LLM use; otherwise the file is kept without text.
      extracted = (await llmEnabled(ctx.user.id, ctx.workspace.workspaceId)) ? await extractVisualAesthetics(bytes, name, type) : null;
      if (extracted === null) status = "unsupported";
    } else if (kind === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await withTimeout(getDocumentProxy(new Uint8Array(bytes)), PARSE_TIMEOUT_MS);
      if (pdf.numPages > MAX_PDF_PAGES) return { ok: false, error: `That PDF has ${pdf.numPages} pages. Upload one with ${MAX_PDF_PAGES} pages or fewer.` };
      const { text: t } = await withTimeout(extractText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS);
      extracted = String(t);
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      extracted = (await withTimeout(mammoth.extractRawText({ buffer: bytes }), PARSE_TIMEOUT_MS)).value;
    } else {
      extracted = bytes.toString("utf8");
    }
    if (extracted !== null) {
      extracted = extracted.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, 60_000);
      status = extracted ? "extracted" : "failed";
    }
  } catch {
    status = "failed";
    extracted = null;
  }

  const id = await withUser(ctx.user.id, async (tx) => {
    const [p] = await tx`select id from projects where id = ${projectId} and workspace_id = ${ctx.workspace.workspaceId}`;
    if (!p) return null;
    const [doc] = await tx`insert into brief_documents (project_id, workspace_id, file_name, mime_type, size_bytes, storage_path, extracted_text, extraction_status, created_by)
      values (${projectId}, ${ctx.workspace.workspaceId}, ${name.slice(0, 200)}, ${type || kind}, ${bytes.length}, ${storagePath}, ${extracted}, ${status}, ${ctx.user.id}) returning id`;
    // Index the text for research retrieval straight away (keyword passages, this project only).
    if (status === "extracted") await ensureChunks(tx, projectId);
    await logActivity(tx, { workspaceId: ctx.workspace.workspaceId, actorId: ctx.user.id, projectId, verb: "uploaded", objectType: "document", objectId: doc.id, summary: `uploaded “${name.slice(0, 80)}” to the brief` });
    return doc.id as string;
  });
  if (!id) return { ok: false, error: "Project not found." };
  revalidatePath(`/projects/${projectId}/brief`);
  return { ok: true, documentId: id, extracted: status === "extracted", textPreview: extracted?.slice(0, 400) ?? null, stored: Boolean(storagePath) };
}

async function authorizeUpload() {
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "brief.edit");
  return ctx;
}

/** Direct upload through the server: used when Supabase Storage isn't configured (local development). */
export async function uploadBriefDocumentAction(form: FormData): Promise<UploadResult> {
  const projectId = String(form.get("projectId") ?? "");
  const file = form.get("file");
  if (!isUuid(projectId) || !(file instanceof File)) return { ok: false, error: "Choose a file to upload." };
  if (file.size === 0 || file.size > MAX_BYTES) return { ok: false, error: "Files must be between 1 byte and 10 MB." };
  if (!kindOf(file.name, file.type)) return { ok: false, error: FORMATS };
  let ctx;
  try {
    ctx = await authorizeUpload();
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  return processDocument(ctx, projectId, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, null);
}

export type UploadTicket = { ok: true; mode: "direct"; bucket: string; path: string; token: string } | { ok: true; mode: "form" } | { ok: false; error: string };

/**
 * Step 1 of a Supabase upload: a one-time signed URL so the browser sends the file straight to Storage.
 * Vercel caps a function request at 4.5 MB, so a 10 MB file can't pass through a server action.
 */
export async function startBriefUploadAction(projectId: string, name: string, size: number, type: string): Promise<UploadTicket> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  if (!(size > 0 && size <= MAX_BYTES)) return { ok: false, error: "Files must be between 1 byte and 10 MB." };
  const kind = kindOf(name, type);
  if (!kind) return { ok: false, error: FORMATS };
  let ctx;
  try {
    ctx = await authorizeUpload();
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  if (!storageOn()) return { ok: true, mode: "form" };
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const path = `${ctx.workspace.workspaceId}/${projectId}/${crypto.randomUUID()}.${kind}`;
  const { data, error } = await (await supabaseServer()).storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Storage didn't accept the upload. Check the bucket is set up (see README) and try again." };
  return { ok: true, mode: "direct", bucket, path: data.path, token: data.token };
}

/** Step 2: the server reads the stored file back, applies the same checks, extracts text and records it. */
export async function finishBriefUploadAction(projectId: string, path: string, name: string, type: string): Promise<UploadResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project." };
  let ctx;
  try {
    ctx = await authorizeUpload();
  } catch (e) {
    return { ok: false, error: (e as ForbiddenError).message };
  }
  // Only a path this workspace and project could have been issued.
  if (!path.startsWith(`${ctx.workspace.workspaceId}/${projectId}/`) || path.includes("..")) return { ok: false, error: "Invalid upload." };
  const { supabaseServer } = await import("@/lib/auth/supabase");
  const store = (await supabaseServer()).storage.from(env().SUPABASE_STORAGE_BUCKET);
  const { data, error } = await store.download(path);
  if (error || !data) return { ok: false, error: "The uploaded file couldn't be read back from Storage. Try again." };
  if (data.size > MAX_BYTES) {
    await store.remove([path]);
    return { ok: false, error: "Files must be 10 MB or smaller." };
  }
  const result = await processDocument(ctx, projectId, { name, type, bytes: Buffer.from(await data.arrayBuffer()) }, path);
  if (!result.ok) await store.remove([path]); // a rejected file isn't kept
  return result;
}

/** Deletes the document and its stored original (deletion is immediate, as the privacy notice says). */
export async function deleteBriefDocumentAction(projectId: string, documentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(projectId) || !isUuid(documentId)) return { ok: false, error: "Invalid request." };
  const ctx = await getCtx();
  assertCan(ctx.workspace.role, "brief.edit");
  const rows = await withUser(ctx.user.id, (tx) => tx`delete from brief_documents where id = ${documentId} and project_id = ${projectId} returning storage_path`);
  if (!rows.length) return { ok: false, error: "Only the person who uploaded a document, or an admin, can delete it." };
  if (rows[0].storage_path && storageOn()) {
    const { supabaseServer } = await import("@/lib/auth/supabase");
    const { error } = await (await supabaseServer()).storage.from(env().SUPABASE_STORAGE_BUCKET).remove([rows[0].storage_path as string]);
    if (error) console.error("[brief] stored file not removed", rows[0].storage_path, error.message);
  }
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
  if (!(await llmEnabled(ctx.user.id, ctx.workspace.workspaceId))) return { ok: true, proposal: templateBriefExtraction(textIn), generator: TEMPLATE_GENERATOR };
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
