// Signs up (or signs in) a user via the UI and saves storage state. Usage: node scripts/e2e-login.mjs <email> <out.json>
import { chromium } from "playwright";
const [email, out, base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${base}/signup`);
await page.fill("#fullName", "Aaditya Goel");
await page.fill("#email", email);
await page.fill("#password", "correct-horse-battery");
await page.fill("#workspaceName", "Acme Agency");
await page.click("button[type=submit]");
await page.waitForTimeout(2500);
if (!page.url().includes("/dashboard")) {
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "correct-horse-battery");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}
await page.context().storageState({ path: out });
console.log("ok", page.url());
await browser.close();
