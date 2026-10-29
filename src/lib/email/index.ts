import "server-only";
import { env } from "@/lib/env";

/**
 * Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Optional: without RESEND_API_KEY and EMAIL_FROM nothing is sent and callers say so.
 * Sending never throws into the caller; failures are logged without message content.
 */
export type Email = { to: string; subject: string; text: string; html: string; replyTo?: string };

export function emailConfigured(): boolean {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.EMAIL_FROM);
}

export async function sendEmail(msg: Email): Promise<{ sent: boolean; error?: string }> {
  const e = env();
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) return { sent: false, error: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("email send failed", res.status);
      return { sent: false, error: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("email send failed", err instanceof Error ? err.name : "unknown");
    return { sent: false, error: "network" };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function appUrl(path: string): string {
  return new URL(path, env().APP_BASE_URL).toString();
}
