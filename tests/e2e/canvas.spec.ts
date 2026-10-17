import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await page.goto("/?sample");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("renders the sample system with its connections", async ({ page }) => {
  await expect(page.getByRole("banner")).toContainText("URL shortener");
  for (const name of [
    "Users",
    "Load balancer",
    "Shortener API · 1",
    "Shortener API · 2",
    "Link cache",
    "Links DB",
  ]) {
    await expect(node(page, name)).toBeVisible();
  }
  await expect(page.locator(".react-flow__edge")).toHaveCount(7);
  // A custom name shows the component type underneath; a default one doesn't.
  await expect(node(page, "Links DB")).toContainText("Database");
  await expect(node(page, "Load balancer").locator("p")).toHaveCount(0);
});

test("clicking selects, shift-click adds, clicking empty canvas clears", async ({ page }) => {
  await node(page, "Links DB").click();
  await expect(node(page, "Links DB")).toHaveClass(/selected/);

  await node(page, "Link cache").click({ modifiers: ["Shift"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);

  await node(page, "Users").click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);

  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
});

test("dragging on empty canvas box-selects", async ({ page }) => {
  const pane = page.locator(".react-flow__pane");
  const box = await pane.boundingBox();
  if (!box) throw new Error("no pane");

  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".react-flow__node.selected")).toHaveCount(6);
});

test("dragging a node moves it, snapped to the 8px grid", async ({ page }) => {
  const target = node(page, "Users");
  const before = await target.boundingBox();
  if (!before) throw new Error("no node");

  await page.mouse.move(before.x + 40, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 120, { steps: 10 });
  await page.mouse.up();

  const after = await target.boundingBox();
  expect(after!.x).toBeGreaterThan(before.x + 50);
  expect(after!.y).toBeGreaterThan(before.y + 50);

  const transform = await target.evaluate((el) => (el as HTMLElement).style.transform);
  const [x, y] = (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  expect(x! % 8).toBe(0);
  expect(y! % 8).toBe(0);
});

test("zoom controls change and reset the zoom", async ({ page }) => {
  const zoomLabel = page.getByRole("button", { name: /^\d+%$/ });
  const initial = await zoomLabel.textContent();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoomLabel).not.toHaveText(initial ?? "");

  await zoomLabel.click();
  await expect(zoomLabel).toHaveText("100%");
});
