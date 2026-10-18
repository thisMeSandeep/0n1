import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const guides = (page: Page) => page.locator("[data-guide]");

async function box(page: Page, name: string) {
  const b = await node(page, name).boundingBox();
  if (!b) throw new Error(`${name} isn't on the canvas`);
  return b;
}

/** Start dragging `name` by its header, and move it so its top is at `top` (screen px). */
async function dragTo(page: Page, name: string, top: number) {
  const start = await box(page, name);
  let x = start.x + 40;
  let y = start.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Get the drag going, sideways and clear of everything, then go for the target.
  x -= 60;
  y -= 60;
  await page.mouse.move(x, y, { steps: 5 });
  const now = await box(page, name);
  await page.mouse.move(x, y + top - now.y, { steps: 5 });
}

test.beforeEach(async ({ page }) => {
  await openLab(page);
  await page
    .getByRole("banner")
    .getByRole("button", { name: /open systems library/ })
    .click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: /^URL shortener/ }).click();
  await expect(node(page, "Links DB")).toHaveCount(1);
});

test("dragging a card nearly level with another shows a guide and snaps it into line", async ({
  page,
}) => {
  const api = await box(page, "Shortener API · 1");
  const zoom = api.width / 208;
  // A whole grid step (8) below the row: the grid alone would leave it there.
  await dragTo(page, "Links DB", api.y + 8 * zoom);
  await expect(guides(page)).toHaveCount(1);
  await expect(page.locator('[data-guide="horizontal"]')).toHaveCount(1);
  expect((await box(page, "Links DB")).y).toBeCloseTo(api.y, 0);

  await page.mouse.up();
  await expect(guides(page)).toHaveCount(0);
  // Still in line after the drop, and saved that way.
  expect((await box(page, "Links DB")).y).toBeCloseTo(api.y, 0);
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(node(page, "Links DB")).toHaveCount(1);
  const reloaded = await box(page, "Links DB");
  expect(reloaded.y).toBeCloseTo((await box(page, "Shortener API · 1")).y, 0);
});

test("a card that isn't near any line gets no guide and isn't moved", async ({ page }) => {
  const api = await box(page, "Shortener API · 1");
  const zoom = api.width / 208;
  await dragTo(page, "Links DB", api.y + 40 * zoom);
  await expect(guides(page)).toHaveCount(0);
  await page.mouse.up();
  expect((await box(page, "Links DB")).y - api.y).toBeCloseTo(40 * zoom, 0);
});
