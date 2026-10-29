import { expect, test } from "@playwright/test";
import { createCampaign, fillBrief, runDemoResearch, signUp, unique } from "./helpers";

test("Scenario H — in-app notifications: research finished and added to a workspace", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const bobEmail = unique("h-b");
  await signUp(a, unique("h-a"), "Hana Owner");
  await signUp(b, bobEmail, "Ben Teammate");

  // Brief interests are saved and the finished demo run notifies its starter.
  const projectId = await createCampaign(a, "Notified campaign");
  await fillBrief(a);
  await a.fill("#interests", "skincare");
  await a.keyboard.press("Enter");
  await expect(a.getByRole("status").filter({ hasText: /Saved/ }).first()).toBeVisible({ timeout: 15_000 });
  await runDemoResearch(a, projectId);
  await a.reload();
  const bell = a.getByRole("button", { name: /Notifications, 1 unread/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await a.getByRole("menuitem", { name: /Research finished · Notified campaign/ }).click();
  await a.waitForURL(new RegExp(`/projects/${projectId}/research\\?run=`));
  await expect(a.getByRole("button", { name: /^Notifications$/ })).toBeVisible();

  // Adding an existing user notifies them in the new workspace; opening it switches workspace.
  await a.goto("/settings/team");
  await a.fill("#invite-email", bobEmail);
  await a.getByRole("button", { name: /^Invite/ }).click();
  await expect(a.getByText(/now has access as member/)).toBeVisible();
  await b.reload();
  await b.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  await b.getByRole("menuitem", { name: /You were added to Hana Owner Agency/ }).click();
  await b.waitForURL(/\/dashboard/);
  await expect(b.getByText("Hana Owner Agency").first()).toBeVisible();
});
