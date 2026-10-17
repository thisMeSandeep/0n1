import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const banner = (page: Page) => page.getByRole("banner");
const nodes = (page: Page) => page.locator(".react-flow__node");
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

async function openBlueprint(page: Page, title: string) {
  await banner(page)
    .getByRole("button", { name: /open systems library/ })
    .click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${title}`) }).click();
}

test("a blueprint opens as a copy that can be edited and saved, leaving the blueprint as it was", async ({
  page,
}) => {
  await openLab(page);
  await openBlueprint(page, "URL shortener");
  await expect(banner(page)).toContainText("URL shortener");
  await expect(nodes(page)).toHaveCount(6);
  // Its description and suggested experiments show with the system.
  await expect(inspector(page)).toContainText("Try this");
  await expect(
    inspector(page).getByRole("list", { name: "Experiments" }).getByRole("listitem"),
  ).not.toHaveCount(0);

  // Edit the copy: rename a component, and delete one.
  await nodes(page)
    .filter({ hasText: /^Users/ })
    .click();
  const name = inspector(page).getByLabel("Component name");
  await name.fill("Everyone");
  await name.press("Enter");
  await nodes(page)
    .filter({ hasText: /^Link cache/ })
    .click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Backspace");
  await expect(nodes(page)).toHaveCount(5);
  await expect(banner(page).getByRole("status")).toHaveText("Saved");

  // The edits were saved…
  await page.reload();
  await expect(banner(page).getByRole("status")).toHaveText("Saved");
  await expect(banner(page)).toContainText("URL shortener");
  await expect(nodes(page)).toHaveCount(5);
  await expect(nodes(page).filter({ hasText: /^Everyone/ })).toHaveCount(1);

  // …and the blueprint itself is unchanged: opening it again gives a fresh copy.
  await openBlueprint(page, "URL shortener");
  await expect(banner(page)).toContainText("URL shortener 2");
  await expect(nodes(page)).toHaveCount(6);
  await expect(nodes(page).filter({ hasText: /^Users/ })).toHaveCount(1);
});

test("blueprints can be opened from the command palette", async ({ page }) => {
  await openLab(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("blueprint shortener");
  await page.getByRole("option", { name: /New system from blueprint: URL shortener/ }).click();
  await expect(banner(page)).toContainText("URL shortener");
  await expect(nodes(page)).toHaveCount(6);
});
