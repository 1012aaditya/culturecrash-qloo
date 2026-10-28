import { expect, test } from "@playwright/test";
import { createCampaign, signUp, unique } from "./helpers";

test("Scenario D — create an experiment with variants, record results, review the outcome", async ({ page }) => {
  await signUp(page, unique("d"));
  const projectId = await createCampaign(page, "Scenario D");
  await page.goto(`/projects/${projectId}/experiments?new=1`);
  await page.fill("#x-name", "Routine messaging test");
  await page.fill("#x-hyp", "Messaging centred on daily self-care routines will generate greater audience interest than the current positioning.");
  await page.fill("#x-pm", "Click-through rate (%)");
  await page.fill("#x-method", "Randomised A/B test (paid social)");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/experiments\/[0-9a-f-]{36}/);
  for (const [label, value] of [["Control — current positioning", "1.1"], ["Variant A", "1.6"]]) {
    await page.selectOption("#r-variant", { label });
    await page.fill("#r-value", value);
    await page.fill("#r-n", "4000");
    await page.getByRole("button", { name: "Record result" }).click();
    await expect(page.getByRole("cell", { name: value, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Click-through rate \(%\) by variant/)).toBeVisible();
  await page.fill("#int", "Variant A outperformed control in this test window.");
  await page.getByRole("button", { name: "Save & mark complete" }).click();
  await expect(page.getByText("completed").first()).toBeVisible();
  await page.goto(`/projects/${projectId}/opportunities#evidence`);
  await expect(page.getByText(/Routine messaging test.*Click-through rate/).first()).toBeVisible();
});
