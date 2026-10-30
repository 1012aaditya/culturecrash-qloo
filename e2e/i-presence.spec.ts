import { expect, test } from "@playwright/test";
import { createCampaign, signUp, unique } from "./helpers";

test("Scenario I — teammates see who is on a project and which field they are editing", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const bobEmail = unique("i-b");
  await signUp(a, unique("i-a"), "Isla Lead");
  await signUp(b, bobEmail, "Omar Writer");
  await a.goto("/settings/team");
  await a.fill("#invite-email", bobEmail);
  await a.getByRole("button", { name: /^Invite/ }).click();
  await expect(a.getByText(/Invitation (emailed|recorded)/)).toBeVisible();
  const projectId = await createCampaign(a, "Shared launch");

  // Bob accepts the invitation on his dashboard (which switches to Isla's workspace) and opens the brief.
  await b.goto("/dashboard");
  await b.getByRole("button", { name: /^Accept/ }).click();
  await b.waitForURL(/\/dashboard/);
  await b.goto(`/projects/${projectId}/brief`);
  await b.locator("#audience").click();

  await expect(a.getByLabel("1 person here now")).toBeVisible({ timeout: 15_000 });
  await expect(a.getByText("Omar is editing Target audience")).toBeVisible({ timeout: 15_000 });
  await expect(a.locator('[data-presence-field="audience"][data-peer-editing="Omar"]')).toBeVisible();

  // Leaving the field clears the marker; leaving the page clears the avatar.
  await b.locator("#brand").click();
  await expect(a.locator('[data-presence-field="audience"][data-peer-editing]')).toHaveCount(0, { timeout: 15_000 });
  await b.close();
  await expect(a.getByLabel("1 person here now")).toHaveCount(0, { timeout: 15_000 });
});
