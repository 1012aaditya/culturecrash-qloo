import "server-only";
import { z } from "zod";
import { ForbiddenError } from "@/lib/permissions";

export type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function invalid(error: z.ZodError): { ok: false; error: string; fieldErrors: Record<string, string> } {
  return {
    ok: false,
    error: "Check the highlighted fields.",
    fieldErrors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])),
  };
}

/** Maps database and permission errors to messages that are safe and useful to show. */
export function friendly(error: unknown, fallback = "Something went wrong while saving. Your changes were not applied."): { ok: false; error: string } {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  const e = error as { code?: string; message?: string } | null;
  const msg = e?.message ?? "";
  if (/Only workspace owners can change owner memberships/i.test(msg)) {
    return { ok: false, error: "Only a workspace owner can change or remove an owner, or make someone an owner." };
  }
  if (/must keep at least one owner/i.test(msg)) {
    return { ok: false, error: "A workspace must keep at least one owner. Make someone else an owner first." };
  }
  if (e?.code === "42501") return { ok: false, error: "Your workspace role does not allow this change." };
  if (e?.code === "23505") return { ok: false, error: "That already exists." };
  if (e?.code === "23514" || e?.code === "22023") return { ok: false, error: "That value is not allowed." };
  console.error("[action]", msg || error);
  return { ok: false, error: fallback };
}

/** Optional free text: trimmed, empty becomes null. */
export const optText = (max: number, label = "This field") =>
  z.string().max(max, `${label} must be ${max} characters or fewer`).optional().nullable().transform((v) => v?.trim() || null);
