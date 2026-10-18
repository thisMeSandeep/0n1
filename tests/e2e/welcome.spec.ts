import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const welcome = (page: Page) => page.getByRole("region", { name: /Build a system/ });
const library = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: /open systems library/ });
const hint = (page: Page) => page.getByText("Double-click anywhere to add a component.");

test("a first visit: welcome → blueprint → run → live metrics", async ({ page }) => {
  await openLab(page, "/", { keepWelcome: true });
  await expect(welcome(page)).toBeVisible();
  await expect(
    welcome(page).getByRole("list", { name: "Blueprints" }).getByRole("button"),
  ).toHaveCount(3);

  await welcome(page)
    .getByRole("button", { name: /^URL shortener/ })
    .click();
  await expect(welcome(page)).toBeHidden();
  await expect(library(page)).toContainText("URL shortener");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await page.keyboard.press("Space");
  await expect(page.getByRole("timer", { name: "Simulation time" })).toHaveText(/00:0[2-9]/, {
    timeout: 5000,
  });
  const vitals = page.getByRole("region", { name: "System vitals" });
  await expect(vitals.locator('[data-vital="throughput"]')).toHaveText(/\d.*\/s/);
  await expect(page.locator("[data-card][data-status]")).toHaveCount(5);

  // The untouched blank system the visit started with isn't left behind.
  await library(page).click();
  await expect(page.getByRole("list", { name: "Systems" }).getByRole("listitem")).toHaveCount(1);
});

test("once dismissed it stays away, and ⋯ → Welcome brings it back", async ({ page }) => {
  await openLab(page, "/", { keepWelcome: true });
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toBeHidden();
  await expect(hint(page)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
  await expect(welcome(page)).toBeHidden();

  await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Welcome" }).click();
  await expect(welcome(page)).toBeVisible();
  await welcome(page).getByRole("button", { name: "Close welcome" }).click();
  await expect(welcome(page)).toBeHidden();
});

test("the first edit closes it, and the empty-canvas hint goes once there's a component", async ({
  page,
}) => {
  await openLab(page, "/", { keepWelcome: true });
  await page
    .getByRole("complementary", { name: "Components" })
    .getByRole("button", { name: /^Service/ })
    .click();
  await expect(welcome(page)).toBeHidden();
  await expect(hint(page)).toBeHidden();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
});

test("a blank canvas keeps the system it started with", async ({ page }) => {
  await openLab(page, "/", { keepWelcome: true });
  await welcome(page).getByRole("button", { name: "Start with a blank canvas" }).click();
  await expect(welcome(page)).toBeHidden();
  await expect(hint(page)).toBeVisible();
  await expect(library(page)).toContainText("Untitled system");
});
