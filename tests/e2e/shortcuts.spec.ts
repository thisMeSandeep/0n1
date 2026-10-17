import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const nodes = (page: Page) => page.locator(".react-flow__node");
const node = (page: Page, name: string) => nodes(page).filter({ hasText: new RegExp(`^${name}`) });
const edges = (page: Page) => page.locator(".react-flow__edge");
const selected = (page: Page) => page.locator(".react-flow__node.selected");
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

/** Select a node by clicking it, then move focus off it so global shortcuts apply. */
async function select(page: Page, name: string) {
  await node(page, name).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?sample");
  await expect(nodes(page)).toHaveCount(6);
});

test("Backspace and Delete remove the selection; undo and redo bring it back and forth", async ({
  page,
}) => {
  await select(page, "Links DB");
  await page.keyboard.press("Backspace");
  await expect(nodes(page)).toHaveCount(5);
  await expect(edges(page)).toHaveCount(5);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodes(page)).toHaveCount(6);
  await expect(edges(page)).toHaveCount(7);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(nodes(page)).toHaveCount(5);

  await page.keyboard.press("ControlOrMeta+z");
  await select(page, "Link cache");
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(5);
});

test("⌘D duplicates and selects the copy", async ({ page }) => {
  await select(page, "Links DB");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(nodes(page)).toHaveCount(7);
  await expect(node(page, "Links DB 2")).toHaveClass(/selected/);
});

test("⌘A selects everything and Escape clears it", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  await expect(selected(page)).toHaveCount(6);
  await expect(inspector(page)).toContainText("13 selected");
  await page.keyboard.press("Escape");
  await expect(selected(page)).toHaveCount(0);
});

test("arrow keys move the selection one grid step, Shift five", async ({ page }) => {
  await select(page, "Users");
  const x = async () =>
    Number(
      (await node(page, "Users").evaluate((el) => (el as HTMLElement).style.transform)).match(
        /translate\((-?[\d.]+)px/,
      )?.[1],
    );
  const start = await x();
  await page.keyboard.press("ArrowRight");
  await expect.poll(x).toBe(start + 8);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(x).toBe(start - 32);
});

test("F fits the view and 1 zooms to 100%", async ({ page }) => {
  const zoom = page.getByRole("button", { name: /^\d+%$/ });
  await page.keyboard.press("1");
  await expect(zoom).toHaveText("100%");
  await page.keyboard.press("f");
  await expect(zoom).not.toHaveText("100%");
});

test("M shows and hides the minimap", async ({ page }) => {
  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toHaveCount(0);
  await page.keyboard.press("m");
  await expect(minimap).toBeVisible();
  await page.keyboard.press("m");
  await expect(minimap).toHaveCount(0);
});

test("? opens the shortcuts sheet; Escape closes it without deselecting", async ({ page }) => {
  await select(page, "Users");
  await page.keyboard.press("Shift+?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Duplicate selection");
  await expect(sheet).toContainText("Collapse or expand the inspector");

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(node(page, "Users")).toHaveClass(/selected/);
});

test("the menu also opens the shortcuts sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("shortcuts don't fire while typing", async ({ page }) => {
  await node(page, "Links DB").click();
  const name = inspector(page).getByLabel("Component name");
  await name.click();
  await name.press("End");
  await name.press("Backspace");
  await name.press("m");
  await name.press("f");
  await name.press("ControlOrMeta+a");
  await expect(nodes(page)).toHaveCount(6);
  await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
  await expect(name).toBeFocused();
  await name.press("Escape");
});

test("Escape in a menu closes the menu but keeps the selection", async ({ page }) => {
  await select(page, "Links DB");
  await inspector(page).getByRole("button", { name: "Component actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(node(page, "Links DB")).toHaveClass(/selected/);
});
