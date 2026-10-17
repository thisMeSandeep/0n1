import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const bar = (page: Page) => page.getByRole("banner").getByRole("group", { name: "Simulation" });
const clock = (page: Page) => bar(page).getByRole("timer", { name: "Simulation time" });

test("Space runs the system, the clock advances, and Shift R resets it", async ({ page }) => {
  await openLab(page, "/?sample");
  await expect(clock(page)).toHaveText("00:00");

  await page.keyboard.press("Space");
  await expect(bar(page).getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(clock(page)).toHaveText(/00:0[2-9]/, { timeout: 5000 });

  await page.keyboard.press("Space");
  await expect(bar(page).getByRole("button", { name: "Run" })).toBeVisible();
  const paused = await clock(page).textContent();
  await page.waitForTimeout(1200);
  await expect(clock(page)).toHaveText(paused ?? "");

  await page.keyboard.press("Shift+R");
  await expect(clock(page)).toHaveText("00:00");
});

test("the Run button and Step work with the mouse; Space on the focused button doesn't double up", async ({
  page,
}) => {
  await openLab(page, "/?sample");
  await bar(page).getByRole("button", { name: "Step 1 second" }).click();
  await expect(clock(page)).toHaveText("00:01");

  await bar(page).getByRole("button", { name: "Run" }).click();
  await expect(bar(page).getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space"); // the clicked button keeps focus; one press, one pause
  await expect(bar(page).getByRole("button", { name: "Run" })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(bar(page).getByRole("button", { name: "Run" })).toBeVisible();
});

test("with keyboard focus on a button, Space presses that button", async ({ page }) => {
  await openLab(page, "/?sample");
  const theme = page.getByRole("banner").getByRole("button", { name: /theme/i });
  await theme.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab"); // keyboard focus, with a focus ring
  await page.keyboard.press("Space");
  await expect(bar(page).getByRole("button", { name: "Run" })).toBeVisible();
  await expect(clock(page)).toHaveText("00:00");
});

test("speed and traffic menus change the run", async ({ page }) => {
  await openLab(page, "/?sample");
  await bar(page).getByRole("button", { name: "Speed 1×" }).click();
  await page.getByRole("menuitemradio", { name: "5×", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Speed 5×" })).toBeVisible();

  await bar(page).getByRole("button", { name: "Traffic 100%" }).click();
  await page.getByRole("menuitemradio", { name: "200%" }).click();
  await expect(bar(page).getByRole("button", { name: "Traffic 200%" })).toBeVisible();

  await page.keyboard.press("Space");
  // At 5× the clock passes 5 s within about a second of real time.
  await expect(clock(page)).toHaveText(/00:(0[5-9]|[1-9]\d)/, { timeout: 4000 });
});

test("an empty system explains why it can't run, and points at the problem", async ({ page }) => {
  await openLab(page);
  await page.keyboard.press("Space");
  const problems = page.getByRole("list", { name: "Problems" });
  await expect(problems).toContainText("Add a Client to send traffic.");
  await expect(bar(page).getByRole("button", { name: "Run" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(problems).toBeHidden();
});

test("settings changes keep the run going; new components restart it", async ({ page }) => {
  await openLab(page, "/?sample");
  const step = bar(page).getByRole("button", { name: "Step 1 second" });
  await step.click();
  await step.click();
  await expect(clock(page)).toHaveText("00:02");

  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Users/ })
    .click();
  const rate = page.getByRole("complementary", { name: "Inspector" }).getByRole("textbox", {
    name: "Requests per second",
  });
  await rate.fill("500");
  await rate.press("Enter");
  await step.click();
  await expect(clock(page)).toHaveText("00:03"); // live: not back to zero

  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").dblclick({ position: { x: 700, y: 700 } });
  await page.getByRole("option", { name: /Worker/ }).click();
  await expect(clock(page)).toHaveText("00:00"); // a new component reloads the system
});
