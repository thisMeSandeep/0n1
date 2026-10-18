import { expect, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

test("a client with spikes sends bursts of traffic", async ({ page }) => {
  await openLab(page, "/?sample");
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Users/ })
    .click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.locator("label", { hasText: /^Spikes$/ }).click();
  await expect(inspector.getByRole("img", { name: /Traffic over the first/ })).toBeVisible();
  const every = inspector.getByRole("textbox", { name: "Spike every" });
  await every.fill("10");
  await every.press("Enter");

  await page.getByRole("button", { name: "Speed 1×" }).click();
  await page.getByRole("menuitemradio", { name: "5×", exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 760 } });
  await page.keyboard.press("Space");

  // Read the system's throughput for about 30 simulated seconds: three spikes.
  const readings: number[] = [];
  const throughput = page
    .getByRole("region", { name: "System vitals" })
    .locator('[data-vital="throughput"]');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    const text = (await throughput.textContent()) ?? "";
    const value = Number.parseFloat(text) * (text.includes("k") ? 1000 : 1);
    if (Number.isFinite(value) && value > 0) readings.push(value);
  }
  expect(readings.length).toBeGreaterThan(10);
  expect(Math.max(...readings)).toBeGreaterThan(Math.min(...readings) * 3);
});
