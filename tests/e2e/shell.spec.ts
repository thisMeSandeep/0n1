import { expect, test } from "@playwright/test";

test.describe("lab shell", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders the top bar, panels and canvas", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("0n1");
    await expect(page.getByRole("banner")).toContainText("0n1");
    await expect(page.getByRole("group", { name: "Simulation" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Components" })).toBeVisible();
    await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  });

  test("[ and ] collapse and restore the panels", async ({ page }) => {
    await page.goto("/");
    const palette = page.getByRole("complementary", { name: "Components" });
    const inspector = page.getByRole("complementary", { name: "Inspector" });

    await page.keyboard.press("[");
    await expect(palette).toHaveCSS("width", "56px");
    await page.keyboard.press("[");
    await expect(palette).toHaveCSS("width", "264px");

    await page.keyboard.press("]");
    await expect(inspector).toBeHidden();
    await page.getByRole("button", { name: "Open inspector" }).click();
    await expect(inspector).toBeVisible();
  });

  test("the theme toggle switches between light and dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");

    await expect(html).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("below 1440px the inspector starts closed and floats over the canvas", async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 900 });
    await page.goto("/");
    const inspector = page.getByRole("complementary", { name: "Inspector" });

    await expect(inspector).toBeHidden();
    await page.keyboard.press("]");
    await expect(
      page.getByRole("main", { name: "Canvas" }).getByRole("complementary"),
    ).toBeVisible();
  });
});

test.describe("small screens", () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test("show the desktop notice, with a way to continue", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("0n1 works best on a desktop or laptop.")).toBeVisible();
    await page.getByRole("button", { name: "Continue anyway" }).click();
    await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible();
  });
});
