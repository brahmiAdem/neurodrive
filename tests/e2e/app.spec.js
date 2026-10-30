import { test, expect } from "@playwright/test";

const text = (page, id) => page.locator(`#${id}`).innerText();

test.beforeEach(async ({ page }) => {
  // Mark the intro dialog as seen so it doesn't cover the UI.
  await page.addInitScript(() => localStorage.setItem("neurodrive.visited", "1"));
});

test("loads without console errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page).toHaveTitle(/NeuroDrive/);
  await expect(page.locator("#st-alive")).toHaveText(/\d+\/80/);
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("cars evolve over generations", async ({ page }) => {
  await page.goto("/");
  await page.click('#speed-tabs button[data-speed="max"]');
  await expect.poll(async () => Number(await text(page, "st-gen")), { timeout: 30_000 }).toBeGreaterThan(5);
  await expect.poll(async () => Number(await text(page, "st-best")), { timeout: 30_000 }).toBeGreaterThan(20);
  await expect(page.locator("#btn-race")).toBeEnabled();
});

test("pause stops the simulation", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-play");
  await expect(page.locator("#btn-play")).toHaveClass(/paused/);
  await expect(page.locator("#hud")).toContainText("PAUSED");
  const before = await text(page, "hud");
  await page.waitForTimeout(600);
  expect(await text(page, "hud")).toBe(before);
});

test("switching tracks updates the active tab", async ({ page }) => {
  await page.goto("/");
  for (const key of ["oval", "serpentine", "random"]) {
    await page.click(`#track-tabs button[data-track="${key}"]`);
    await expect(page.locator(`#track-tabs button[data-track="${key}"]`)).toHaveClass(/active/);
  }
});

test("draw a custom track", async ({ page }) => {
  await page.goto("/");
  await page.click('#track-tabs button[data-track="custom"]');
  await expect(page.locator("#editor-bar")).toBeVisible();
  await page.click("#ed-clear");
  const box = await page.locator("#sim").boundingBox();
  for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.25], [0.75, 0.75], [0.25, 0.7]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  await page.click("#ed-apply");
  await expect(page.locator("#editor-bar")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Custom track ready");
});

test("race the AI after training", async ({ page, isMobile }) => {
  test.skip(isMobile, "race mode needs a keyboard");
  await page.goto("/");
  await page.click("#btn-skip");
  await page.click("#btn-race");
  await expect(page.locator("#race-bar")).toBeVisible();
  await expect(page.locator("#hud")).toContainText("YOU");
  await page.click("#race-exit");
  await expect(page.locator("#race-bar")).toBeHidden();
});

test("layout has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
