import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";
export const unique = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.test`;

export async function signUp(page: Page, email: string, name = "E2E Strategist") {
  await page.goto("/signup");
  await page.fill("#fullName", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#workspaceName", `${name} Agency`);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);
}

export async function createCampaign(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.fill("#name", name);
  await page.fill("input[name=newClientName]", "Lumen Labs");
  await page.fill("#brand", "Lumen");
  await page.fill("#category", "Skincare");
  await page.fill("#market", "India");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/brief/);
  return page.url().match(/projects\/([0-9a-f-]{36})/)![1];
}

export async function fillBrief(page: Page) {
  await page.fill("#product", "Premium skincare line");
  await page.fill("#audience", "Gen Z in Indian metros who treat skincare as self-expression");
  await page.fill("#objective", "Launch the line and build consideration");
  await page.fill("#competitors", "Nykaa");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /Saved/ }).first()).toBeVisible({ timeout: 15_000 });
}

export async function runDemoResearch(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/research`);
  await page.getByRole("button", { name: /Demo run/ }).first().click();
  await expect(page.getByRole("button", { name: /affinity/ }).first()).toBeVisible({ timeout: 30_000 });
}
