import { expect, test } from "@playwright/test";
import { createCampaign, fillBrief, runDemoResearch, signUp, unique } from "./helpers";

test("Scenario J — multi-source research: client document, cited report, evidence inspector, API isolation", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const other = await (await browser.newContext()).newPage();
  await signUp(page, unique("j-a"), "Jo Strategist");
  await signUp(other, unique("j-b"), "Kai Outsider");
  const projectId = await createCampaign(page, "Deep research campaign");
  await fillBrief(page);

  // A client document becomes searchable brand context for this project only.
  await page.locator("#brief-file").setInputFiles({ name: "brand-guidelines.txt", mimeType: "text/plain",
    buffer: Buffer.from("Lumen brand guidelines.\n\nOur positioning: skincare as a calm daily ritual for Gen Z in India. We avoid clinical, fear-based claims.\n\nTone: warm, honest, unhurried.") });
  await expect(page.getByText("brand-guidelines.txt").first()).toBeVisible({ timeout: 15_000 });

  await runDemoResearch(page, projectId);
  const runId = new URL(page.url()).searchParams.get("run")!;
  await page.goto(`/projects/${projectId}/research?run=${runId}`);
  await expect(page.getByRole("tab", { name: /sources/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Demonstration data").first()).toBeVisible();

  // Report: completeness is stated, citations open the evidence inspector.
  await expect(page.getByText(/complete|partial|limited/).first()).toBeVisible();
  await page.getByRole("button", { name: "Open claim 1" }).first().click();
  await expect(page.getByText(/Why this quality score/)).toBeVisible();
  await expect(page.getByText(/a ranking aid, not a probability/)).toBeVisible();

  // Sources include the client document and mark duplicates honestly.
  await page.getByRole("tab", { name: /sources/ }).click();
  await expect(page.getByText("brand-guidelines.txt (client document)")).toBeVisible();

  // REST API: the owner can read the job; another workspace gets 404, signed-out gets 401.
  const mine = await page.request.get(`/api/research/${runId}/evidence?limit=5`);
  expect(mine.status()).toBe(200);
  expect((await mine.json()).claims.length).toBeGreaterThan(0);
  expect((await other.request.get(`/api/research/${runId}`)).status()).toBe(404);
  expect((await other.request.get(`/api/research/${runId}/sources`)).status()).toBe(404);
  const anon = await (await browser.newContext()).request.get(`/api/research/${runId}/report`);
  expect(anon.status()).toBe(401);
});
