import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const clock = (page: Page) => page.getByRole("timer", { name: "Simulation time" });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const vitals = (page: Page) => page.getByRole("region", { name: "System vitals" });

async function run(page: Page) {
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[2-9]/, { timeout: 5000 });
}

test("the vitals pill shows the system's health once running", async ({ page }) => {
  await openLab(page, "/?sample");
  await expect(vitals(page)).toContainText("—");
  await run(page);
  await expect(vitals(page).locator('[data-vital="throughput"]')).toHaveText(/\d.*\/s/);
  await expect(vitals(page).locator('[data-vital="p99"]')).toHaveText(/\d.*(ms|s)/);
  await expect(vitals(page).locator('[data-vital="errors"]')).toHaveText(/\d.*%/);
});

test("the system view streams health, traffic and charts", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  await expect(inspector(page)).toContainText("Health");
  await expect(inspector(page).getByRole("region", { name: "Traffic from Users" })).toBeVisible();
  for (const name of ["Throughput over time", "p99 over time", "Errors over time"]) {
    await expect(inspector(page).getByRole("img", { name })).toBeVisible();
  }
  await expect(inspector(page).locator(".uplot canvas")).toHaveCount(3);

  // Hovering a chart reads out the value at that moment.
  const chart = inspector(page).getByRole("img", { name: "Throughput over time" });
  const box = await chart.boundingBox();
  if (!box) throw new Error("no chart");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect(inspector(page).getByText(/\/s at 00:0\d/)).toBeVisible();
});

test("charts stream smoothly while running", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  await expect(inspector(page).locator(".uplot canvas")).toHaveCount(3);
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const end = performance.now() + 2000;
        const tick = (time: number) => {
          times.push(time);
          if (time < end) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((t, i) => t - (times[i] as number)));
        };
        requestAnimationFrame(tick);
      }),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(20);
  expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(34);
});

test("a component's live summary stays visible, with details below", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Links DB/ })
    .click();
  const summary = inspector(page).getByRole("region", { name: "Live summary" });
  await expect(summary).toContainText("Throughput");
  await expect(summary).toContainText("p99");
  await expect(summary).toContainText("Busy");
  await expect(summary.getByRole("img", { name: /p99, recent values/ })).toBeVisible();

  // Scrolling the settings keeps the summary in place.
  await inspector(page).getByRole("button", { name: "Details" }).scrollIntoViewIfNeeded();
  await expect(summary).toBeInViewport();
  await inspector(page).getByRole("button", { name: "Details" }).click();
  await expect(inspector(page).getByText("Total arrived")).toBeVisible();
});

test("a connection shows its live rate, round trip and errors", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  const path = page.locator('.react-flow__edge[data-id="lb-api-1"] .react-flow__edge-interaction');
  const box = await path.boundingBox();
  if (!box) throw new Error("no edge");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const summary = inspector(page).getByRole("region", { name: "Live summary" });
  await expect(summary).toContainText("Rate");
  await expect(summary).toContainText("p99 round trip");
  await expect(inspector(page)).toContainText("each way");
});

test("several selected components can be taken down together", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Shortener API · 1/ })
    .click();
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Shortener API · 2/ })
    .click({ modifiers: ["Shift"] });
  await inspector(page).getByRole("button", { name: "Take down" }).click();
  await expect(page.locator('[data-card][data-status="down"]')).toHaveCount(2);
  await inspector(page).getByRole("button", { name: "Bring back" }).click();
  await expect(page.locator('[data-card][data-status="down"]')).toHaveCount(0);
});
