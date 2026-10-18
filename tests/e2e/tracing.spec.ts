import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const clock = (page: Page) => page.getByRole("timer", { name: "Simulation time" });

test("tracing a request shows each hop with its timing, and lights up its path", async ({
  page,
}) => {
  await openLab(page, "/?sample");
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[1-9]/, { timeout: 5000 });

  await inspector(page).getByRole("button", { name: "Trace a request" }).click();
  await expect(inspector(page).getByRole("heading", { name: "Request trace" })).toBeVisible();
  await expect(inspector(page)).toContainText(/Answered after [\d.]+ ms/);

  const hops = inspector(page).getByRole("list", { name: "Hops" }).getByRole("listitem");
  const labels = await hops.evaluateAll((items) =>
    items.map((i) => i.getAttribute("aria-label") ?? ""),
  );
  expect(labels[0]).toMatch(/^Users, answered after/);
  // One request in ten is a write: it updates Links DB, then clears the key from the cache.
  expect(labels[1]).toMatch(/^Load balancer \((read|write)\), busy .* ms, answered after .* ms/);
  expect(labels[2]).toMatch(/^Shortener API · [12] \((read|write)\)/);
  expect(labels.some((l) => /^Link cache \((get|delete)\)/.test(l))).toBe(true);

  // The traced path stands out; the other API steps back.
  const traced = page
    .locator(".react-flow__node")
    .filter({ hasText: /^Shortener API/ })
    .locator("[data-card]");
  await expect(traced.and(page.locator(".opacity-40"))).toHaveCount(1);

  await inspector(page).getByRole("button", { name: "Back to the system" }).click();
  await expect(inspector(page).getByRole("list", { name: "Traces" })).toContainText(
    /Traced · Users · (read|write)/,
  );
  await expect(page.locator("[data-card].opacity-40")).toHaveCount(0);
});

test("a client's menu traces its next request, and the run keeps the slowest one lately", async ({
  page,
}) => {
  await openLab(page, "/?sample");
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Users/ })
    .click();
  await inspector(page).getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: "Trace a request" }).click();
  // Not running yet: the trace comes once the run starts.
  await page.keyboard.press("Space");
  await expect(inspector(page).getByRole("heading", { name: "Request trace" })).toBeVisible({
    timeout: 5000,
  });

  await inspector(page).getByRole("button", { name: "Back to the system" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 760 } });
  await expect(inspector(page).getByRole("list", { name: "Traces" })).toContainText(
    "Slowest lately",
    {
      timeout: 10_000,
    },
  );
});
