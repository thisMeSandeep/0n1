import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const banner = (page: Page) => page.getByRole("banner");
const nodes = (page: Page) => page.locator(".react-flow__node");
const edges = (page: Page) => page.locator(".react-flow__edge");
/** By name exactly: "Links DB" isn't "Links DB 2". */
const node = (page: Page, name: string) =>
  nodes(page).filter({ hasText: new RegExp(`^${name}(?! \\d)`) });
const selectedNames = (page: Page) =>
  nodes(page)
    .and(page.locator(".selected"))
    .evaluateAll((els) => els.map((el) => el.querySelector(".truncate")?.textContent));

async function newSystem(page: Page, item: RegExp | string) {
  const library = banner(page).getByRole("button", { name: /open systems library/ });
  await library.click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await openLab(page);
  await newSystem(page, /^URL shortener/);
  await expect(nodes(page)).toHaveCount(5);
});

test("copy and paste in the same system: copies step down and right, numbered, one undo each", async ({
  page,
}) => {
  await node(page, "Links DB").click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(nodes(page)).toHaveCount(6);
  await expect(node(page, "Links DB 2")).toHaveCount(1);
  expect(await selectedNames(page)).toEqual(["Links DB 2"]);

  const original = await node(page, "Links DB").boundingBox();
  const copy = await node(page, "Links DB 2").boundingBox();
  expect((copy?.x ?? 0) - (original?.x ?? 0)).toBeGreaterThan(10);
  expect((copy?.y ?? 0) - (original?.y ?? 0)).toBeGreaterThan(10);

  await page.keyboard.press("ControlOrMeta+v");
  await expect(node(page, "Links DB 3")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodes(page)).toHaveCount(6);
});

test("components and the connections between them paste into another system", async ({ page }) => {
  await node(page, "Shortener API · 1").click();
  await node(page, "Links DB").click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");

  await newSystem(page, "Blank system");
  await expect(nodes(page)).toHaveCount(0);
  await page.locator(".react-flow__pane").click({ position: { x: 400, y: 300 } });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(nodes(page)).toHaveCount(2);
  await expect(edges(page)).toHaveCount(1);
  // Free names are kept, and the paste is in view.
  await expect(node(page, "Shortener API · 1")).toBeInViewport();
  await expect(node(page, "Links DB")).toBeInViewport();
  await expect(banner(page).getByRole("status")).toHaveText("Saved");
});

test("cut and paste puts components back where they were", async ({ page }) => {
  const before = await node(page, "Links DB").boundingBox();
  await node(page, "Links DB").click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(nodes(page)).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(nodes(page)).toHaveCount(5);
  const after = await node(page, "Links DB").boundingBox();
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
});

test("in a text field, copy and paste are about text", async ({ page }) => {
  await node(page, "Links DB").click();
  await page.keyboard.press("ControlOrMeta+c");
  const name = page.getByRole("complementary", { name: "Inspector" }).getByLabel("Component name");
  await name.click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(nodes(page)).toHaveCount(5);
});

test("the component menu copies, and ⌘K pastes", async ({ page }) => {
  await node(page, "Links DB").click();
  await page.getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: /^Copy/ }).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /Paste components/ }).click();
  await expect(node(page, "Links DB 2")).toHaveCount(1);
});
