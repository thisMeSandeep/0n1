import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

// A menu's Copy and Cut write to the clipboard as a real browser lets a click do.
test.use({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const nodes = (page: Page) => page.locator(".react-flow__node");
/** By name exactly: "Links DB" isn't "Links DB 2". */
const node = (page: Page, name: string) =>
  nodes(page).filter({ hasText: new RegExp(`^${name}(?! \\d)`) });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const menu = (page: Page) => page.getByRole("menu", { name: "Component actions" });

test.beforeEach(async ({ page }) => {
  await openLab(page);
  await page
    .getByRole("banner")
    .getByRole("button", { name: /open systems library/ })
    .click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: /^URL shortener/ }).click();
  await expect(nodes(page)).toHaveCount(5);
});

test("clicking a component opens the inspector if it was closed", async ({ page }) => {
  await page.locator(".react-flow__pane").click({ position: { x: 300, y: 600 } });
  await page.keyboard.press("]");
  await expect(inspector(page)).toBeHidden();
  await node(page, "Links DB").click();
  await expect(inspector(page)).toBeVisible();
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Links DB");

  // Already selected, closed again: a click still opens it.
  await page.keyboard.press("]");
  await expect(inspector(page)).toBeHidden();
  await node(page, "Links DB").click();
  await expect(inspector(page)).toBeVisible();
});

test("right-clicking a component shows its actions, and they act on it", async ({ page }) => {
  await node(page, "Links DB").click({ button: "right" });
  await expect(menu(page).getByRole("menuitem")).toHaveText([
    /^Duplicate/,
    /^Copy/,
    /^Cut/,
    /^Reset settings to defaults/,
    /^Take down/,
    /^Delete/,
  ]);
  await menu(page)
    .getByRole("menuitem", { name: /^Duplicate/ })
    .click();
  await expect(node(page, "Links DB 2")).toHaveCount(1);

  // The copy overlaps the original, a step down and right: click its top-left corner.
  const corner = { x: 12, y: 12 };
  await node(page, "Links DB").click({ button: "right", position: corner });
  await menu(page)
    .getByRole("menuitem", { name: /^Take down/ })
    .click();
  await expect(node(page, "Links DB")).toContainText(/down/i);
  await node(page, "Links DB").click({ button: "right", position: corner });
  await expect(menu(page).getByRole("menuitem", { name: /^Bring back/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  // Right-clicking selected it, so the inspector shows it.
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Links DB");
});

test("a client's menu can trace a request", async ({ page }) => {
  await node(page, "Users").click({ button: "right" });
  await expect(menu(page).getByRole("menuitem", { name: "Trace a request" })).toBeVisible();
});

test("right-clicking inside a selection acts on all of it; outside it, on just that one", async ({
  page,
}) => {
  await node(page, "Shortener API · 1").click();
  await node(page, "Shortener API · 2").click({ modifiers: ["Shift"] });
  await node(page, "Shortener API · 2").click({ button: "right" });
  await expect(menu(page)).toContainText("2 components");
  await menu(page)
    .getByRole("menuitem", { name: /^Delete/ })
    .click();
  await expect(nodes(page)).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodes(page)).toHaveCount(5);

  await node(page, "Shortener API · 1").click();
  await node(page, "Shortener API · 2").click({ modifiers: ["Shift"] });
  await node(page, "Links DB").click({ button: "right" });
  await expect(menu(page)).not.toContainText("components");
  await menu(page).getByRole("menuitem", { name: /^Cut/ }).click();
  await expect(nodes(page)).toHaveCount(4);
  await expect(node(page, "Shortener API · 1")).toHaveCount(1);
  // What was cut pastes back.
  await page.keyboard.press("ControlOrMeta+v");
  await expect(node(page, "Links DB")).toHaveCount(1);
});
