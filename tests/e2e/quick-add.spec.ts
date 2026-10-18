import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const nodes = (page: Page) => page.locator(".react-flow__node");
const node = (page: Page, name: string) => nodes(page).filter({ hasText: new RegExp(`^${name}`) });
const edges = (page: Page) => page.locator(".react-flow__edge");
const quickAdd = (page: Page) => page.getByRole("dialog");

async function doubleClickCanvas(page: Page, x: number, y: number) {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.dblclick(box.x + x, box.y + y);
}

/** Drag from `from`'s output dot to a point on empty canvas. */
async function dragIntoSpace(page: Page, from: string, x: number, y: number) {
  await node(page, from).hover();
  const handle = await node(page, from).locator(".handle-source").boundingBox();
  const canvas = await page.getByTestId("canvas").boundingBox();
  if (!handle || !canvas) throw new Error("missing handle");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + x, canvas.y + y, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await openLab(page);
});

test("double-clicking empty canvas adds a component right there", async ({ page }) => {
  await doubleClickCanvas(page, 400, 300);
  const search = quickAdd(page).getByRole("combobox");
  await expect(search).toBeFocused();

  await search.fill("cache");
  await page.keyboard.press("Enter");

  await expect(node(page, "Cache")).toBeVisible();
  await expect(node(page, "Cache")).toHaveClass(/selected/);
  await expect(quickAdd(page)).toBeHidden();

  const canvas = await page.getByTestId("canvas").boundingBox();
  const placed = await node(page, "Cache").boundingBox();
  expect(Math.abs(placed!.x + placed!.width / 2 - canvas!.x - 400)).toBeLessThan(24);
});

test("Escape closes quick add without adding anything", async ({ page }) => {
  await doubleClickCanvas(page, 400, 300);
  await expect(quickAdd(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickAdd(page)).toBeHidden();
  await expect(nodes(page)).toHaveCount(0);
});

test("dragging a connection into empty space offers only valid targets and connects", async ({
  page,
}) => {
  await doubleClickCanvas(page, 200, 300);
  await page.keyboard.type("client");
  await page.keyboard.press("Enter");

  await dragIntoSpace(page, "Client", 600, 300);
  await expect(quickAdd(page).getByRole("combobox")).toHaveAttribute(
    "placeholder",
    "Connect Client to…",
  );
  await expect(quickAdd(page).getByRole("option")).toHaveText([
    "Load balancer",
    "API gateway",
    "CDN",
    "DNS",
    "Rate limiter",
    "Service",
  ]);

  await quickAdd(page).getByRole("option", { name: "Service" }).click();
  await expect(nodes(page)).toHaveCount(2);
  await expect(edges(page)).toHaveCount(1);
});

test("a three-component system can be built without the palette", async ({ page }) => {
  await doubleClickCanvas(page, 150, 300);
  await page.keyboard.type("client");
  await page.keyboard.press("Enter");

  await dragIntoSpace(page, "Client", 450, 300);
  await page.keyboard.type("lb");
  await page.keyboard.press("Enter");

  await dragIntoSpace(page, "Load balancer", 750, 300);
  await page.keyboard.type("service");
  await page.keyboard.press("Enter");

  await expect(nodes(page)).toHaveCount(3);
  await expect(edges(page)).toHaveCount(2);
  await expect(node(page, "Service")).toBeVisible();
});

test.describe("command palette", () => {
  test("⌘K opens it, and commands run", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openLab(page);

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    await page.keyboard.type("database");
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    await expect(node(page, "Database")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("dark");
    // Plain substring matching: only the theme command matches "dark".
    await expect(palette.getByRole("option")).toHaveText(["Switch to dark theme"]);
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(nodes(page)).toHaveCount(1);
  });

  test("⌘K again or Escape closes it", async ({ page }) => {
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });
});
