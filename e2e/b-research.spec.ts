import { expect, test } from "@playwright/test";
import { createCampaign, fillBrief, runDemoResearch, signUp, unique } from "./helpers";

test("Scenario B (live) — a live Qloo run either returns provider data or fails honestly without fixtures", async ({ page }) => {
  await signUp(page, unique("b-live"));
  const projectId = await createCampaign(page, "Scenario B live");
  await fillBrief(page);
  await page.goto(`/projects/${projectId}/research`);
  // The research form: question, depth, timeframe and source availability.
  await page.getByRole("button", { name: /Start research/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Quick/ }).click();
  await dialog.getByRole("button", { name: "Start research" }).click();
  // Live runs either produce a report from real sources or fail honestly — never fixtures.
  const outcome = page.getByText("This research run failed").or(page.getByRole("tab", { name: /sources/ }));
  await expect(outcome.first()).toBeVisible({ timeout: 80_000 });
  if (await page.getByText("This research run failed").isVisible()) {
    await expect(page.getByText(/No fixture data was substituted/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry live research/ })).toBeVisible();
    await page.goto(`/projects/${projectId}/research/history`);
    await expect(page.getByText(/failed/).first()).toBeVisible();
  } else {
    await expect(page.getByText("Demonstration data")).toHaveCount(0);
  }
});

test("Scenario B (demo) — labelled demonstration run, network, entity panel, evidence verification", async ({ page }) => {
  await signUp(page, unique("b-demo"));
  const projectId = await createCampaign(page, "Scenario B demo");
  await fillBrief(page);
  await runDemoResearch(page, projectId);
  await expect(page.getByText("Demonstration data").first()).toBeVisible();
  await page.getByRole("button", { name: /affinity/ }).first().click();
  await expect(page.getByText(/Observed data · demonstration fixture/)).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Network view" }).click();
  await page.getByRole("button", { name: /affinity/ }).first().click();
  await page.getByRole("link", { name: /Verify evidence/ }).click();
  await expect(page.getByText("Provenance")).toBeVisible();
  await expect(page.getByText("Underlying provider response")).toBeVisible();
  await expect(page.getByText(/Affinity is a correlation in taste/)).toBeVisible();
});
