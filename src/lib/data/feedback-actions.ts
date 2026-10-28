"use server";

import { z } from "zod";
import { withUser } from "@/lib/db";
import { friendly, invalid, type Result } from "./action-utils";
import { getCtx } from "./workspace";

const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "question", "other"], { message: "Choose a category" }),
  message: z.string().trim().min(1, "Tell us a little more").max(4000, "Keep feedback under 4,000 characters"),
  page: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => (v && v.startsWith("/") && !v.startsWith("//") ? v : null)),
});

/** Stores feedback for the product team. RLS: members insert their own rows only. */
export async function submitFeedbackAction(input: z.input<typeof feedbackSchema>): Promise<Result> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getCtx();
  const d = parsed.data;
  try {
    await withUser(ctx.user.id, (tx) => tx`
      insert into feedback (workspace_id, user_id, category, message, page)
      values (${ctx.workspace.workspaceId}, ${ctx.user.id}, ${d.category}, ${d.message}, ${d.page})`);
  } catch (e) {
    return friendly(e, "Your feedback could not be saved. Please try again.");
  }
  return { ok: true, message: "Thanks — your feedback was saved for the product team." };
}
