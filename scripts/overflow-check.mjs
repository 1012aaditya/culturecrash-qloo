import { chromium } from "playwright";
const S = process.env.S, P = process.env.P, base = process.env.BASE ?? "http://localhost:3100";
const routes = ["/", "/product", "/showcase", "/pricing", "/dashboard", "/projects", `/projects/${P}`, `/projects/${P}/brief`, `/projects/${P}/research`, `/projects/${P}/opportunities`, `/projects/${P}/strategy`, `/projects/${P}/experiments`, `/projects/${P}/reports`, "/settings/team", "/workspace", "/tasks", "/search?q=sk"];
const browser = await chromium.launch();
for (const w of [390, 820]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 900 }, storageState: `${S}/state.json` })).newPage();
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) console.log(`${w}px overflow ${over}px: ${r}`);
  }
  if (w === 390) { await page.goto(`${base}/projects/${P}/research`); await page.screenshot({ path: `${S}/m-research.png`, fullPage: false }); }
}
console.log("done");
await browser.close();
