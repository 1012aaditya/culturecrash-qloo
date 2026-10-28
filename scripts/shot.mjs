// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [fullPage]
import { chromium } from "playwright";
const [url, out, w = "1440", h = "900", full = "0"] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, storageState: process.env.STATE || undefined });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: full === "1" });
await browser.close();
