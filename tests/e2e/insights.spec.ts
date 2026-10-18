import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

async function choose(page: Page, button: string, item: string) {
  await page.getByRole("banner").getByRole("button", { name: button }).click();
  await page.getByRole("menuitemradio", { name: item, exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
}

test("an overloaded database is explained in plain English, and the note leads to it", async ({
  page,
}) => {
  await openLab(page, "/", { keepWelcome: true });
  await page
    .getByRole("region", { name: /Build a system/ })
    .getByRole("button", { name: /^URL shortener/ })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await choose(page, "Traffic 100%", "500%");
  await choose(page, "Speed 1×", "5×");
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("Space");

  const note = page.locator("[data-insight-note]");
  await expect(note).toContainText("Links DB has no free connections.", { timeout: 10_000 });
  await expect(note).toContainText(/requests are waiting, about .* each/);

  const happening = inspector(page).getByRole("list", { name: "Insights" });
  await expect(happening).toContainText("Links DB has no free connections.");
  await expect(happening).toContainText("Add a cache, a read replica, or more connections.");
  await expect(happening).toContainText("The wait is in Links DB.");

  await note.click();
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Links DB");
  await expect(inspector(page).getByRole("list", { name: "Insights" })).toContainText(
    "Links DB has no free connections.",
  );
});

test("a calm system says nothing", async ({ page }) => {
  await openLab(page, "/?sample");
  await choose(page, "Speed 1×", "5×");
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("Space");
  await expect(page.getByRole("timer", { name: "Simulation time" })).toHaveText(
    /00:(1[5-9]|[2-9]\d)/,
    {
      timeout: 8000,
    },
  );
  await expect(page.locator("[data-insight-note]")).toHaveCount(0);
});
