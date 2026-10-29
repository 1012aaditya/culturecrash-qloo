"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { after } from "next/server";
import { privilegedSql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { pilotRequestEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { TEAM_SIZES } from "./team-sizes";

export type PilotRequestState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<PilotField, string>>;
      /** Echo of what was submitted so the form can be re-populated after React resets it. */
      values?: Partial<Record<PilotField, string>>;
      /** Changes on every failed attempt so the client can re-mount the form with `values`. */
      attempt: string;
    };

type PilotField = "name" | "email" | "company" | "teamSize" | "message";

const PER_EMAIL_HOURLY_LIMIT = 5;
const GLOBAL_HOURLY_LIMIT = 200;

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(120, "Keep your name under 120 characters"),
  email: z.string().trim().toLowerCase().max(254, "That email is too long").email("Enter a valid work email"),
  company: z.string().trim().min(1, "Tell us your agency or company").max(160, "Keep this under 160 characters"),
  teamSize: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || (TEAM_SIZES as readonly string[]).includes(v), "Choose a team size from the list"),
  message: z
    .string()
    .trim()
    .max(2000, "Keep the message under 2,000 characters")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function requestPilotAction(_prev: PilotRequestState, form: FormData): Promise<PilotRequestState> {
  // Honeypot: real people never see or fill this field. Pretend success so bots learn nothing.
  if (str(form, "website")) {
    return { status: "success", message: "Thanks — your pilot request has been received." };
  }

  const raw = {
    name: (str(form, "name") ?? "").slice(0, 200),
    email: (str(form, "email") ?? "").slice(0, 300),
    company: (str(form, "company") ?? "").slice(0, 200),
    teamSize: (str(form, "teamSize") ?? "").slice(0, 60),
    message: (str(form, "message") ?? "").slice(0, 2100),
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors, values: raw, attempt: randomUUID() };
  }
  const { name, email, company, teamSize, message } = parsed.data;

  let sql;
  try {
    sql = privilegedSql();
  } catch {
    return { status: "error", message: "Pilot requests are temporarily unavailable: the database is not configured on this server.", values: raw, attempt: randomUUID() };
  }

  try {
    const [counts] = await sql<{ by_email: number; total: number }[]>`
      select
        count(*) filter (where lower(email) = ${email})::int as by_email,
        count(*)::int as total
      from public.pilot_requests
      where created_at > now() - interval '1 hour'
    `;
    if ((counts?.by_email ?? 0) >= PER_EMAIL_HOURLY_LIMIT) {
      return { status: "error", message: "We already have several recent requests from this email. Please try again in an hour.", values: raw, attempt: randomUUID() };
    }
    if ((counts?.total ?? 0) >= GLOBAL_HOURLY_LIMIT) {
      return { status: "error", message: "We are receiving an unusual number of requests. Please try again later.", values: raw, attempt: randomUUID() };
    }

    await sql`
      insert into public.pilot_requests (name, email, company, team_size, message)
      values (${name}, ${email}, ${company}, ${teamSize ?? null}, ${message ?? null})
    `;
  } catch (error) {
    console.error("pilot request insert failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "We couldn't save your request just now. Please try again in a moment.", values: raw, attempt: randomUUID() };
  }

  const notifyTo = env().PILOT_NOTIFY_EMAIL;
  if (notifyTo) {
    const msg = pilotRequestEmail({ to: notifyTo, name, email, company, teamSize: teamSize ?? null, message: message ?? null });
    after(() => sendEmail(msg).then(() => undefined));
  }

  return {
    status: "success",
    message: `Thanks, ${name.split(/\s+/)[0]} — your pilot request for ${company} has been received. We'll reply to ${email}.`,
  };
}
