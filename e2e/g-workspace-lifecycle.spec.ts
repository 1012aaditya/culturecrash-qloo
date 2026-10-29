import { expect, test } from "@playwright/test";
import { createCampaign, signUp, unique } from "./helpers";

test("Scenario G — owner sets retention and deletes a workspace", async ({ page }) => {
  await signUp(page, unique("g"), "Gia Owner");

  // The only workspace cannot be deleted.
  await page.goto("/settings/workspace");
  await expect(page.getByRole("button", { name: /Delete this workspace/ })).toBeDisabled();

  // Retention is saved.
  await page.selectOption("#ws-retention", "90");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Retention updated")).toBeVisible();
  await page.reload();
  await expect(page.locator("#ws-retention")).toHaveValue("90");

  // A second workspace with a campaign is deleted with its contents.
  await page.fill("#ws-new", "Temporary Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/workspace\?created=1/);
  const projectId = await createCampaign(page, "Short-lived campaign");
  await page.goto("/settings/workspace");
  await page.getByRole("button", { name: /Delete this workspace/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Delete workspace" })).toBeDisabled();
  await dialog.locator("#ws-delete-confirm").fill("Temporary Studio");
  await dialog.getByRole("button", { name: "Delete workspace" }).click();
  await page.waitForURL(/\/dashboard\?workspace=deleted/);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Not found, or not shared with you")).toBeVisible();
});
