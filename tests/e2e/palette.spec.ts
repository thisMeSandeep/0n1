import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const palette = (page: Page) => page.getByRole("complementary", { name: "Components" });
const item = (page: Page, name: string) => palette(page).getByRole("button", { name, exact: true });
const nodes = (page: Page) => page.locator(".react-flow__node");
const node = (page: Page, name: string) => nodes(page).filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("lists every component in its group", async ({ page }) => {
  for (const group of ["Traffic", "Network", "Compute", "Data", "Messaging"]) {
    await expect(palette(page).getByRole("button", { name: group, exact: true })).toBeVisible();
  }
  for (const name of [
    "Client",
    "Load balancer",
    "API gateway",
    "CDN",
    "Service",
    "Worker",
    "Database",
    "Cache",
    "Read replica",
    "Queue",
  ]) {
    await expect(item(page, name)).toBeVisible();
  }
});

test("groups fold away", async ({ page }) => {
  await palette(page).getByRole("button", { name: "Data", exact: true }).click();
  await expect(item(page, "Cache")).toBeHidden();
  await palette(page).getByRole("button", { name: "Data", exact: true }).click();
  await expect(item(page, "Cache")).toBeVisible();
});

test("clicking adds a selected component without stacking it on another", async ({ page }) => {
  await item(page, "Service").click();
  await item(page, "Service").click();

  await expect(nodes(page)).toHaveCount(2);
  await expect(node(page, "Service 2")).toHaveClass(/selected/);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);

  const a = await node(page, "Service").first().boundingBox();
  const b = await node(page, "Service 2").boundingBox();
  const overlap =
    a &&
    b &&
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;
  expect(overlap).toBeFalsy();
});

test("search filters, Enter adds the top result, Escape clears", async ({ page }) => {
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Search components" });
  await expect(search).toBeFocused();

  await page.keyboard.type("db");
  const results = palette(page).getByRole("list", { name: "Search results" }).getByRole("button");
  await expect(results).toHaveText(["Database", "Read replica"]);

  await page.keyboard.press("Enter");
  await expect(node(page, "Database")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(item(page, "Client")).toBeVisible();

  await search.fill("teleporter");
  await expect(palette(page)).toContainText("No components match “teleporter”.");
});

test("dragging onto the canvas drops the component where you let go", async ({ page }) => {
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  const drop = { x: 300, y: 200 };

  await item(page, "Cache").dragTo(canvas, { targetPosition: drop });

  const placed = await node(page, "Cache").boundingBox();
  if (!placed) throw new Error("cache not placed");
  const centre = {
    x: placed.x + placed.width / 2 - box.x,
    y: placed.y + placed.height / 2 - box.y,
  };
  expect(Math.abs(centre.x - drop.x)).toBeLessThan(24);
  expect(Math.abs(centre.y - drop.y)).toBeLessThan(24);
});

test("the collapsed rail still adds components", async ({ page }) => {
  await page.keyboard.press("[");
  await palette(page).getByRole("button", { name: "Add cache" }).click();
  await expect(node(page, "Cache")).toBeVisible();

  // `/` opens the panel again and focuses search.
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 600 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search components" })).toBeFocused();
});

test("the mockup's components can be built from the palette alone", async ({ page }) => {
  for (const name of ["Client", "Load balancer", "Service", "Service", "Cache", "Database"]) {
    await item(page, name).click();
  }
  await expect(nodes(page)).toHaveCount(6);
  for (const name of ["Client", "Load balancer", "Service", "Service 2", "Cache", "Database"]) {
    await expect(node(page, name).first()).toBeVisible();
  }
});
