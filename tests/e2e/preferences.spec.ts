import { expect, test } from "@playwright/test";
import { openLab, storedSetting } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

test("the chosen theme survives a reload, with no flash of the other theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  // Record every value data-theme takes, from the very first. Init scripts run
  // before <html> exists, so watch the whole document for it.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __themes: string[] }).__themes = seen;
    new MutationObserver(() => {
      const theme = document.documentElement?.dataset.theme;
      if (theme && seen.at(-1) !== theme) seen.push(theme);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
  });
  await openLab(page);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes)).toEqual(
    ["dark"],
  );
});

test("panels, palette groups and the minimap are remembered", async ({ page }) => {
  await openLab(page);
  const palette = page.getByRole("complementary", { name: "Components" });
  await palette.getByRole("button", { name: "Data", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Cache", exact: true })).toBeHidden();
  await page.keyboard.press("m");
  await page.keyboard.press("]");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  // Settings are written asynchronously; reload only once they're stored.
  await expect.poll(() => storedSetting(page, "minimap")).toBe(true);
  await expect.poll(() => storedSetting(page, "panels")).toMatchObject({ inspectorOpen: false });

  await page.reload();
  await openLab(page);
  await expect(palette.getByRole("button", { name: "Cache", exact: true })).toBeHidden();
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();

  await page.keyboard.press("[");
  await expect.poll(() => storedSetting(page, "panels")).toMatchObject({ paletteOpen: false });
  await page.reload();
  await openLab(page);
  await expect(palette).toHaveCSS("width", "56px");
});

test("panel choices made at one width don't carry over to another", async ({ page }) => {
  await openLab(page);
  await page.keyboard.press("[");
  await expect(page.getByRole("complementary", { name: "Components" })).toHaveCSS("width", "56px");
  await expect.poll(() => storedSetting(page, "panels")).toMatchObject({ paletteOpen: false });

  await page.setViewportSize({ width: 1300, height: 900 });
  await page.reload();
  await openLab(page);
  // 1280–1439px defaults: palette open, inspector closed.
  await expect(page.getByRole("complementary", { name: "Components" })).toHaveCSS("width", "264px");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
});
