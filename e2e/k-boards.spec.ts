import { expect, test } from "@playwright/test";
import { createCampaign, signUp, unique } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("Scenario K — inspiration boards: cards, undo, persistence, search and comments", async ({ page }) => {
  await signUp(page, unique("k"), "Kai Designer");
  const projectId = await createCampaign(page, "Board campaign");

  // A board is created from the Create stage.
  await page.goto(`/projects/${projectId}/boards`);
  await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.locator("#board-name").fill("Launch moodboard");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.waitForURL(/\/boards\/[0-9a-f-]{36}$/);
  const boardUrl = page.url();
  const cards = page.locator(".react-flow__node");

  // A note and a group are added and edited in place.
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.locator(".react-flow__node-note textarea").fill("Warm, musical, unhurried");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(cards).toHaveCount(2);

  // A link card keeps its address (regression: it used to be blanked on save).
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.locator("#link-url").fill("example.com/reference");
  await page.locator("#link-title").fill("Reference article");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".react-flow__node-link a")).toHaveAttribute("href", "https://example.com/reference");

  // Undo and redo the last card.
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
  await page.keyboard.press(`${mod}+z`);
  await expect(cards).toHaveCount(2);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(cards).toHaveCount(3);

  // Image uploads explain themselves when Storage is not configured (local test servers).
  await page.locator("input[type=file]").setInputFiles({ name: "swatch.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await expect(page.getByText(/not added/)).toBeVisible();

  // Everything is saved and comes back after a reload.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goto(boardUrl);
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".react-flow__node-note textarea")).toHaveValue("Warm, musical, unhurried");

  // The list view is an accessible alternative to the canvas.
  await page.getByRole("button", { name: "Show as list" }).click();
  await expect(page.getByRole("table")).toContainText("Reference article");
  await page.getByRole("button", { name: "Show canvas" }).click();

  // A card can be discussed.
  await page.locator(".react-flow__node-note").click({ position: { x: 6, y: 6 } });
  await page.getByRole("toolbar").getByRole("button", { name: "Comments" }).click();
  await page.locator("#card-comment").fill("Use this as the tone for captions.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByLabel("Card comments")).toContainText("Use this as the tone for captions.");
  await expect(page.locator(".react-flow__node-note").getByRole("button", { name: "1 comment" })).toBeVisible();

  // Workspace search finds the board by text written on a card.
  await page.goto(`/search?q=${encodeURIComponent("musical")}`);
  await expect(page.getByRole("link", { name: /Launch moodboard/ })).toBeVisible();

  // The board list shows it; deleting it removes it.
  await page.goto(boardUrl);
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete board" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}/boards$`));
  await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
});
