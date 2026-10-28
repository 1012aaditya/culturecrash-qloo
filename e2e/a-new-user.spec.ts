import { expect, test } from "@playwright/test";
import { createCampaign, fillBrief, signIn, signUp, unique } from "./helpers";

test("Scenario A — sign up, sign in, create a campaign, save the brief, reopen", async ({ page, context }) => {
  const email = unique("a");
  await signUp(page, email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/E2E/);
  await page.getByRole("button", { name: "Account and workspace menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await signIn(page, email);
  const projectId = await createCampaign(page, "Scenario A launch");
  await fillBrief(page);
  await context.clearCookies({ name: "cc_ws" });
  await page.goto("/projects");
  await page.getByRole("link", { name: "Open Scenario A launch" }).click();
  await page.goto(`/projects/${projectId}/brief`);
  await expect(page.locator("#audience")).toHaveValue(/Gen Z in Indian metros/);
  await expect(page.locator("#brand")).toHaveValue("Lumen");
});

test("protected routes redirect anonymous visitors to sign in", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
});
