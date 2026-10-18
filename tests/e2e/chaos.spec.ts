import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const timeline = (page: Page) => page.getByRole("region", { name: "Chaos timeline" });
const card = (page: Page, name: string) =>
  page
    .locator(".react-flow__node")
    .filter({ hasText: new RegExp(`^${name}`) })
    .locator("[data-card]");
const clock = (page: Page) => page.getByRole("timer", { name: "Simulation time" });

async function addEvent(page: Page, fill: (form: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await timeline(page).getByRole("button", { name: "Add event" }).click();
  const form = page.getByRole("form", { name: "New event" });
  await fill(form);
  await form.getByRole("button", { name: "Add" }).click();
  await expect(form).toBeHidden();
}

async function setNumber(form: ReturnType<Page["getByRole"]>, name: string, value: string) {
  const field = form.getByRole("textbox", { name });
  await field.fill(value);
  await field.press("Enter"); // commits the value, without submitting the form
}

test("a planned outage takes a component down on time, and brings it back", async ({ page }) => {
  await openLab(page);
  // Start from the URL shortener blueprint, saved like any system.
  await page
    .getByRole("banner")
    .getByRole("button", { name: /open systems library/ })
    .click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: /^URL shortener/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await page.keyboard.press("t");
  await expect(timeline(page)).toBeVisible();
  await addEvent(page, async (form) => {
    await form.getByLabel("What").selectOption("down");
    await form.getByLabel("Component").selectOption({ label: "Shortener API · 1" });
    await setNumber(form, "At", "10");
    await setNumber(form, "For", "20");
  });
  const bar = timeline(page).getByRole("button", {
    name: "Shortener API · 1 down for 20 s, at 00:10",
  });
  await expect(bar).toBeVisible();

  // The plan is saved with the system.
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(
    timeline(page).getByRole("button", { name: /Shortener API · 1 down for 20 s/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Speed 1×" }).click();
  await page.getByRole("menuitemradio", { name: "5×", exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 600 } });
  await page.keyboard.press("Space");

  await expect(card(page, "Shortener API · 1")).toHaveAttribute("data-status", "down", {
    timeout: 6000,
  });
  await expect(card(page, "Shortener API · 1")).toContainText("Down since 00:10");
  await expect(card(page, "Shortener API · 1")).not.toHaveAttribute("data-status", "down", {
    timeout: 10_000,
  });
  await expect(clock(page)).toHaveText(/00:(3\d|[4-9]\d)/);
});

test("events can be edited and deleted, and a slowdown shows on the component", async ({
  page,
}) => {
  await openLab(page, "/?sample");
  await page.keyboard.press("t");
  await addEvent(page, async (form) => {
    await form.getByLabel("What").selectOption("slow");
    await form.getByLabel("Component").selectOption({ label: "Links DB" });
    await setNumber(form, "At", "1");
  });
  const bar = timeline(page).getByRole("button", { name: /Links DB slowed ×3 for 20 s/ });
  await expect(bar).toBeVisible();

  await bar.click();
  const editor = page.getByRole("form", { name: "Edit event" });
  await setNumber(editor, "Work takes ×", "5");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(timeline(page).getByRole("button", { name: /Links DB slowed ×5/ })).toBeVisible();

  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 600 } });
  await page.keyboard.press("Space");
  await expect(page.locator(".react-flow__node").filter({ hasText: /Slowed ×5/ })).toHaveCount(1, {
    timeout: 5000,
  });

  await timeline(page)
    .getByRole("button", { name: /Links DB slowed ×5/ })
    .click();
  await page
    .getByRole("form", { name: "Edit event" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(timeline(page).getByRole("button", { name: /Links DB slowed/ })).toHaveCount(0);
});
