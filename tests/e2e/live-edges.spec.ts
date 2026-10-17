import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const clock = (page: Page) => page.getByRole("timer", { name: "Simulation time" });
const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="${id}"]`);
const dotXs = (page: Page, id: string) =>
  edge(page, id)
    .locator("circle")
    .evaluateAll((dots) => dots.map((d) => d.getAttribute("cx")));

async function run(page: Page) {
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[1-9]/, { timeout: 5000 });
}

test("connections carry flow dots while running, frozen while paused", async ({ page }) => {
  await openLab(page, "/?sample");
  await expect(edge(page, "users-lb").locator("circle")).toHaveCount(0);
  await run(page);
  await expect(edge(page, "users-lb").locator("[data-edge-status]")).toHaveAttribute(
    "data-edge-status",
    "healthy",
  );
  const dots = edge(page, "users-lb").locator("circle");
  await expect(dots).not.toHaveCount(0);
  const before = await dotXs(page, "users-lb");
  await page.waitForTimeout(300);
  expect(await dotXs(page, "users-lb")).not.toEqual(before); // moving

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Run" })).toBeVisible();
  const paused = await dotXs(page, "users-lb");
  await page.waitForTimeout(400);
  expect(await dotXs(page, "users-lb")).toEqual(paused); // frozen in place
});

test("with reduced motion there are no dots, only thickness", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLab(page, "/?sample");
  await run(page);
  await expect(edge(page, "users-lb").locator("[data-edge-status]")).toHaveAttribute(
    "data-edge-status",
    "healthy",
  );
  await expect(page.locator(".react-flow__edge circle")).toHaveCount(0);
});

test("connections to a component that's down go dashed", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Shortener API · 2/ })
    .click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("k");
  for (const id of ["lb-api-2", "api-2-cache", "api-2-db"]) {
    await expect(edge(page, id).locator("[data-edge-status]")).toHaveAttribute(
      "data-edge-status",
      "down",
    );
  }
  await expect(edge(page, "lb-api-1").locator("[data-edge-status]")).not.toHaveAttribute(
    "data-edge-status",
    "down",
  );
});

test("resting the pointer on a connection shows its rate, p99 and errors", async ({ page }) => {
  await openLab(page, "/?sample");
  await run(page);
  const path = edge(page, "lb-api-1").locator(".react-flow__edge-interaction");
  const box = await path.boundingBox();
  if (!box) throw new Error("no edge");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const label = page.locator("[data-edge-label]");
  await expect(label).toContainText(/\/s/);
  await expect(label).toContainText(/p99/);
  await expect(label).toContainText(/errors/);
  await page.mouse.move(5, 400);
  await expect(label).toBeHidden();
});

test("a 30-component system runs at a smooth frame rate", async ({ page }) => {
  await openLab(page, "/?sample=large");
  await expect(page.locator(".react-flow__node")).toHaveCount(30);
  await page.keyboard.press("1"); // 100%: every component shows its numbers
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  // Heavy traffic: a busy engine and plenty of dots.
  await page.getByRole("button", { name: "Traffic 100%" }).click();
  await page.getByRole("menuitemradio", { name: "1000%", exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await run(page);
  await expect.poll(() => page.locator(".react-flow__edge circle").count()).toBeGreaterThan(140);

  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const end = performance.now() + 3000;
        const tick = (time: number) => {
          times.push(time);
          if (time < end) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((t, i) => t - (times[i] as number)));
        };
        requestAnimationFrame(tick);
      }),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] as number;
  console.log(`frames: ${frames.length}, median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
  expect(median).toBeLessThan(20); // ~60 fps
  expect(p95).toBeLessThan(34); // rarely below 30 fps
});
