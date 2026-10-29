import { appUrl, escapeHtml, type Email } from "./index";

/** One plain, brand-consistent layout. Every dynamic value is escaped. */
function layout(heading: string, paragraphs: string[], cta?: { label: string; href: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#111116">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#111116;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F7F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8064F5">CultureCrash</p>
<div style="background:#ffffff;border:1px solid #E9E5E1;border-radius:20px;padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111116">${escapeHtml(heading)}</h1>${body}${button}</div>
<p style="margin:18px 4px 0;font-size:12px;color:#696774">You can change email preferences in Settings → Notifications.</p>
</div></body></html>`;
}

function text(heading: string, paragraphs: string[], cta?: { label: string; href: string }) {
  return [heading, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.href}`] : [])].join("\n");
}

function build(to: string, subject: string, heading: string, paragraphs: string[], cta?: { label: string; href: string }, replyTo?: string): Email {
  return { to, subject, html: layout(heading, paragraphs, cta), text: text(heading, paragraphs, cta), replyTo };
}

export function invitationEmail(o: { to: string; workspace: string; inviter: string; role: string; added: boolean }): Email {
  return o.added
    ? build(o.to, `You now have access to ${o.workspace}`, `You’ve been added to ${o.workspace}`,
        [`${o.inviter} added you to the ${o.workspace} workspace on CultureCrash as ${o.role}.`], { label: "Open CultureCrash", href: appUrl("/dashboard") })
    : build(o.to, `${o.inviter} invited you to ${o.workspace} on CultureCrash`, `Join ${o.workspace}`,
        [`${o.inviter} invited you to the ${o.workspace} workspace on CultureCrash as ${o.role}.`, `Create an account with this email address (${o.to}) and you will join the workspace automatically.`],
        { label: "Create your account", href: appUrl("/signup") });
}

export function researchFinishedEmail(o: { to: string; project: string; projectId: string; runId: string; ok: boolean; entities: number; error: string | null; demo: boolean }): Email {
  const href = appUrl(`/projects/${o.projectId}/research?run=${o.runId}`);
  return o.ok
    ? build(o.to, `Research finished · ${o.project}`, "Your research run is ready",
        [`The cultural research run for “${o.project}” completed with ${o.entities} entities and taste tags.`, ...(o.demo ? ["This run used labelled demonstration data, not live Qloo results."] : [])],
        { label: "Open the cultural canvas", href })
    : build(o.to, `Research failed · ${o.project}`, "Your research run did not complete",
        [`The research run for “${o.project}” failed${o.error ? `: ${o.error}` : "."}`, "No substitute data was used. You can review the provider requests and try again."],
        { label: "Review the run", href });
}

export function reportSharedEmail(o: { to: string; sharer: string; project: string; projectId: string; report: string }): Email {
  return build(o.to, `${o.sharer} shared a report · ${o.project}`, "A report link was created",
    [`${o.sharer} created a share link for “${o.report}” in your campaign “${o.project}”.`, "You can see, expire or revoke links from the report page."],
    { label: "Open reports", href: appUrl(`/projects/${o.projectId}/reports`) });
}

export function pilotRequestEmail(o: { to: string; name: string; email: string; company: string; teamSize: string | null; message: string | null }): Email {
  return build(o.to, `Pilot request · ${o.company}`, "New pilot request",
    [`Name: ${o.name}`, `Email: ${o.email}`, `Company: ${o.company}`, `Team size: ${o.teamSize ?? "not given"}`, `Message: ${o.message ?? "—"}`],
    undefined, o.email);
}

export function weeklyDigestEmail(o: { to: string; workspaces: { name: string; activity: number; runs: number; reports: number; openTasks: number }[] }): Email {
  const lines = o.workspaces.map((w) => `${w.name}: ${w.activity} updates, ${w.runs} research runs completed, ${w.reports} report versions, ${w.openTasks} open tasks.`);
  return build(o.to, "Your CultureCrash week", "This week in your workspaces", lines, { label: "Open your dashboard", href: appUrl("/dashboard") });
}
