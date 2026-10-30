import { describe, expect, it } from "vitest";
import { invitationEmail, pilotRequestEmail, researchFinishedEmail } from "@/lib/email/templates";

describe("email templates", () => {
  it("escapes user-supplied values in HTML", () => {
    const m = invitationEmail({ to: "a@b.test", workspace: "<script>x</script>", inviter: "Ann & Co", role: "member" });
    expect(m.html).not.toContain("<script>x</script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("Ann &amp; Co");
    expect(m.text).toContain("accept the invitation");
  });

  it("labels demo runs and links to the run", () => {
    const m = researchFinishedEmail({ to: "a@b.test", project: "P", projectId: "p1", runId: "r1", ok: true, entities: 5, error: null, demo: true });
    expect(m.text).toContain("demonstration data");
    expect(m.text).toContain("/projects/p1/research?run=r1");
  });

  it("sets reply-to on pilot requests", () => {
    expect(pilotRequestEmail({ to: "team@x.test", name: "N", email: "lead@y.test", company: "C", teamSize: null, message: null }).replyTo).toBe("lead@y.test");
  });
});
