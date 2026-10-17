import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const palette = (page: Page) => page.getByRole("complementary", { name: "Components" });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const nodes = (page: Page) => page.locator(".react-flow__node");
const status = (page: Page) => page.getByRole("banner").getByRole("status");

async function snapshot(page: Page) {
  return page
    .locator(".react-flow__node")
    .evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent, transform: (el as HTMLElement).style.transform })),
    );
}

test("a first visit opens a saved, untitled system", async ({ page }) => {
  await openLab(page);
  await expect(page.getByRole("banner")).toContainText("Untitled system");
  await expect(status(page)).toHaveText("Saved");
});

test("edits autosave, and reloading restores the exact design", async ({ page }) => {
  await openLab(page);
  await palette(page).getByRole("button", { name: "Client", exact: true }).click();
  await palette(page).getByRole("button", { name: "Service", exact: true }).click();

  // Connect them so the edge is part of what must survive.
  const client = nodes(page).filter({ hasText: /^Client/ });
  await client.hover();
  const handle = await client.locator(".handle-source").boundingBox();
  const service = await nodes(page)
    .filter({ hasText: /^Service/ })
    .boundingBox();
  await page.mouse.move(handle!.x + 6, handle!.y + 6);
  await page.mouse.down();
  await page.mouse.move(service!.x + 100, service!.y + 30, { steps: 10 });
  await page.mouse.up();

  // Change a setting and rename the system.
  await nodes(page)
    .filter({ hasText: /^Service/ })
    .click();
  const concurrency = inspector(page).getByRole("textbox", { name: "Requests at once" });
  await concurrency.fill("64");
  await concurrency.press("Enter");
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 40 } });
  const name = inspector(page).getByLabel("System name");
  await name.fill("Checkout");
  await name.press("Enter");

  await expect(status(page)).toHaveText("Saved");
  const before = await snapshot(page);

  await page.reload();
  await expect(nodes(page)).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.getByRole("banner")).toContainText("Checkout");
  expect(await snapshot(page)).toEqual(before);

  await nodes(page)
    .filter({ hasText: /^Service/ })
    .click();
  await expect(inspector(page).getByRole("textbox", { name: "Requests at once" })).toHaveValue(
    "64",
  );
});

test("the indicator shows saving while a change is pending", async ({ page }) => {
  await openLab(page);
  await expect(status(page)).toHaveText("Saved");
  await palette(page).getByRole("button", { name: "Cache", exact: true }).click();
  await expect(status(page)).toHaveText("Saving…");
  await expect(status(page)).toHaveText("Saved");
});
