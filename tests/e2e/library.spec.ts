import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const banner = (page: Page) => page.getByRole("banner");
const nodes = (page: Page) => page.locator(".react-flow__node");
const systemsList = (page: Page) => page.getByRole("list", { name: "Systems" });
const row = (page: Page, name: string) =>
  systemsList(page)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${name}Open|^${name}Edited`) });

async function openLibrary(page: Page) {
  await banner(page)
    .getByRole("button", { name: /open systems library/ })
    .click();
  await expect(systemsList(page)).toBeVisible();
}

async function rowAction(page: Page, name: string, action: string) {
  const item = row(page, name);
  await item.hover();
  await item.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

test.beforeEach(async ({ page }) => {
  await openLab(page);
});

test("creates new systems and switches between them", async ({ page }) => {
  await page
    .getByRole("complementary", { name: "Components" })
    .getByRole("button", { name: "Cache", exact: true })
    .click();
  await expect(nodes(page)).toHaveCount(1);

  await openLibrary(page);
  await page.getByRole("button", { name: "New system" }).click();
  await expect(banner(page)).toContainText("Untitled system 2");
  await expect(nodes(page)).toHaveCount(0);

  await openLibrary(page);
  await expect(row(page, "Untitled system 2")).toContainText("Open");
  await row(page, "Untitled system").getByRole("button").first().click();
  await expect(banner(page)).not.toContainText("Untitled system 2");
  await expect(nodes(page)).toHaveCount(1);
});

test("renames a system from its row", async ({ page }) => {
  await openLibrary(page);
  await rowAction(page, "Untitled system", "Rename");
  const input = systemsList(page).getByLabel("System name");
  await input.fill("Checkout");
  await input.press("Enter");
  await expect(row(page, "Checkout")).toBeVisible();
  await expect(banner(page)).toContainText("Checkout");
});

test("duplicates a system and finds it by search", async ({ page }) => {
  await openLibrary(page);
  await rowAction(page, "Untitled system", "Duplicate");
  await expect(row(page, "Untitled system copy")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search systems" }).fill("copy");
  await expect(systemsList(page).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search systems" }).fill("nothing like this");
  await expect(systemsList(page)).toContainText("No systems match");
});

test("deletes a system, and Undo brings it back", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "New system" }).click();
  await openLibrary(page);

  await rowAction(page, "Untitled system", "Delete");
  await expect(row(page, "Untitled system")).toHaveCount(0);
  // The visible toast lives in Radix's "Notifications" region (it also announces
  // a hidden copy for screen readers).
  const toasts = page.getByRole("region", { name: /Notifications/ });
  await expect(toasts).toContainText("Deleted “Untitled system”");

  await toasts.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "Untitled system")).toBeVisible();
});

test("deleting the open system switches to another one", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "New system" }).click();
  await expect(banner(page)).toContainText("Untitled system 2");

  await openLibrary(page);
  await rowAction(page, "Untitled system 2", "Delete");
  await expect(banner(page)).not.toContainText("Untitled system 2");
  await expect(banner(page)).toContainText("Untitled system");
});

test("the library survives a reload, and ⌘K can open systems", async ({ page }) => {
  await openLibrary(page);
  await rowAction(page, "Untitled system", "Rename");
  await systemsList(page).getByLabel("System name").fill("Payments");
  await systemsList(page).getByLabel("System name").press("Enter");
  await page.getByRole("button", { name: "New system" }).click();
  await expect(banner(page)).toContainText("Untitled system");

  await page.reload();
  await openLab(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("open payments");
  // Saved systems load asynchronously; wait for the command before choosing it.
  await expect(page.getByRole("option", { name: "Open “Payments”" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(banner(page)).toContainText("Payments");
});
