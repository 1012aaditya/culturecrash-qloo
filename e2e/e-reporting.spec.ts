import { expect, test } from "@playwright/test";
import { createCampaign, fillBrief, runDemoResearch, signUp, unique } from "./helpers";

test("Scenario E — generate report, verify contents, export PDF, share read-only, revoke", async ({ page, browser }) => {
  await signUp(page, unique("e"));
  const projectId = await createCampaign(page, "Scenario E");
  await fillBrief(page);
  await runDemoResearch(page, projectId);
  await page.goto(`/projects/${projectId}/reports?new=1`);
  await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await page.waitForURL(/reports\/[0-9a-f-]{36}/);
  const reportId = page.url().match(/reports\/([0-9a-f-]{36})/)![1];
  for (const h of ["Executive summary", "Research scope & methodology", "Cultural landscape", "Key evidence", "Limitations & open questions", "Sources & appendix"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByText(/demonstration data/i).first()).toBeVisible();
  const pdf = await page.request.get(`/api/reports/${reportId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const body = await pdf.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(body)), { mergePages: true });
  expect(text).toContain("Executive summary");
  expect(text).toContain("DEMONSTRATION DATA");
  expect(text).toMatch(/\[1\]/);
  await page.getByRole("button", { name: /^Share/ }).click();
  await page.getByRole("button", { name: /Create link/ }).click();
  const link = await page.getByLabel("Share link").inputValue();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(link);
  await expect(anon.getByRole("heading", { name: "Key evidence" })).toBeVisible();
  await expect(anon.getByRole("link", { name: /Projects/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Revoke/ }).first().click();
  // Wait for the real confirmation (the dialog text also contains the word "revoked").
  await expect(page.getByText("Link revoked")).toBeVisible();
  await anon.reload();
  await expect(anon.getByText("This link is not available")).toBeVisible();
});
