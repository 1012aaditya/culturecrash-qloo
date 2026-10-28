import { expect, test } from "@playwright/test";
import { createCampaign, runDemoResearch, signUp, unique } from "./helpers";

test("Scenario F — cross-workspace access is denied by the server", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signUp(a, unique("f-a"), "Alice Owner");
  await signUp(b, unique("f-b"), "Bob Outsider");
  const projectA = await createCampaign(a, "Alice private campaign");
  await runDemoResearch(a, projectA);
  const runId = new URL(a.url()).searchParams.get("run");
  await createCampaign(b, "Bob campaign");

  for (const path of [`/projects/${projectA}`, `/projects/${projectA}/brief`, `/projects/${projectA}/research`, `/projects/${projectA}/strategy`]) {
    await b.goto(path);
    await expect(b.getByText("Not found, or not shared with you")).toBeVisible();
    await expect(b.getByText("Alice private campaign")).toHaveCount(0);
  }
  const api = await b.request.get(`/api/projects/${projectA}/runs/${runId}`);
  expect(api.status()).toBe(404);
  const exp = await b.request.get(`/api/projects/${projectA}/creative-brief/export`);
  expect(exp.status()).toBe(404);
  const search = await (await b.request.get(`/api/search?q=Alice`)).json();
  expect(search.hits).toHaveLength(0);
  await b.goto("/projects");
  await expect(b.getByText("Alice private campaign")).toHaveCount(0);
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.request.get(`/api/search?q=Alice`)).status()).toBe(401);
});
