import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const palette = (page: Page) => page.getByRole("complementary", { name: "Components" });
const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const edges = (page: Page) => page.locator(".react-flow__edge");

async function add(page: Page, name: string) {
  await palette(page).getByRole("button", { name, exact: true }).click();
}

/** Drag from `from`'s output dot to the middle of `to`, pausing over the target. */
async function dragConnection(page: Page, from: string, to: string, release = true) {
  await node(page, from).hover();
  const handle = node(page, from).locator(".handle-source");
  const start = await handle.boundingBox();
  const end = await node(page, to).boundingBox();
  if (!start || !end) throw new Error("missing node");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
  if (release) await page.mouse.up();
}

test("dragging from a component's right edge onto another connects them", async ({ page }) => {
  await openLab(page);
  await add(page, "Client");
  await add(page, "Service");

  await dragConnection(page, "Client", "Service");
  await expect(edges(page)).toHaveCount(1);
  // The new connection is selected.
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);
});

test("an invalid target explains why while hovering, and nothing is connected", async ({
  page,
}) => {
  await openLab(page);
  await add(page, "Database");
  await add(page, "Client");

  await dragConnection(page, "Database", "Client", false);
  await expect(page.getByTestId("canvas").getByRole("status")).toHaveText(
    "Client doesn't take requests.",
  );
  await expect(node(page, "Client").locator("[data-card]")).toHaveCSS("opacity", "0.45");
  // The drag line turns into a quiet dashed line over a component that can't take it.
  await expect(page.locator(".react-flow__connectionline path")).toHaveAttribute(
    "stroke-dasharray",
    "4 5",
  );
  await page.mouse.up();

  await expect(edges(page)).toHaveCount(0);
  await expect(page.getByTestId("canvas").getByRole("status")).toHaveCount(0);
});

test("components that only receive requests have no output dot", async ({ page }) => {
  await openLab(page);
  await add(page, "Cache");
  await node(page, "Cache").hover();
  await expect(node(page, "Cache").locator(".handle-source")).toHaveCount(0);
});

test("unconnected components carry a hint that goes away once wired up", async ({ page }) => {
  await openLab(page);
  await add(page, "Client");
  await add(page, "Service");

  const clientHint = node(page, "Client").getByRole("button", { name: /Not connected yet/ });
  await expect(clientHint).toBeVisible();
  await expect(
    node(page, "Service").getByRole("button", { name: /Not connected yet/ }),
  ).toBeVisible();

  await dragConnection(page, "Client", "Service");
  await expect(node(page, "Client").getByRole("button", { name: /Not connected/ })).toHaveCount(0);
  await expect(node(page, "Service").getByRole("button", { name: /Not connected/ })).toHaveCount(0);
});

test("a load balancer with nothing behind it says so", async ({ page }) => {
  await openLab(page);
  await add(page, "Client");
  await add(page, "Load balancer");
  await dragConnection(page, "Client", "Load balancer");

  await expect(
    node(page, "Load balancer").getByRole("button", { name: /nowhere to send requests/ }),
  ).toBeVisible();
});
