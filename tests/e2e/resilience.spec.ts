import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

const breaker = {
  threshold: 50,
  minimumCalls: 20,
  window: 10,
  coolDown: 30,
  probes: 5,
  timeout: 1000,
};

/** Users → Rate limiter → API → Circuit breaker → Payments, with Payments failing every call. */
function backup() {
  const at = (x: number, y: number) => ({ x, y });
  const now = Date.now();
  return {
    format: "0n1-backup",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    systems: [
      {
        schemaVersion: 1,
        id: "guarded",
        name: "Checkout",
        meta: { createdAt: now, updatedAt: now },
        nodes: [
          {
            id: "users",
            type: "client",
            name: "Users",
            position: at(0, 200),
            params: { rate: 200 },
          },
          {
            id: "limiter",
            type: "rate-limiter",
            name: "Limiter",
            position: at(280, 200),
            params: { limit: 150, scope: "everyone", burst: 20 },
          },
          { id: "api", type: "service", name: "Checkout API", position: at(560, 200), params: {} },
          {
            id: "breaker",
            type: "circuit-breaker",
            name: "Breaker",
            position: at(840, 200),
            params: breaker,
          },
          {
            id: "payments",
            type: "service",
            name: "Payments",
            position: at(1120, 200),
            params: { errorRate: 100 },
          },
        ],
        edges: [
          { id: "e1", source: "users", target: "limiter" },
          { id: "e2", source: "limiter", target: "api" },
          { id: "e3", source: "api", target: "breaker" },
          { id: "e4", source: "breaker", target: "payments" },
        ],
      },
    ],
  };
}

test("both components are in the palette, under Network", async ({ page }) => {
  await openLab(page);
  const palette = page.getByRole("complementary", { name: "Components" });
  await expect(palette.getByRole("button", { name: /^Rate limiter/ })).toBeVisible();
  await expect(palette.getByRole("button", { name: /^Circuit breaker/ })).toBeVisible();
});

test("a breaker opens to protect a failing dependency, and a limiter holds traffic to its limit", async ({
  page,
}, testInfo) => {
  await openLab(page);
  const file = testInfo.outputPath("guarded.json");
  await writeFile(file, JSON.stringify(backup()));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Restore from backup…" }).click();
  await (await chooser).setFiles(file);
  await page.getByRole("button", { name: "Restore system" }).click();
  await page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(node(page, "Breaker")).toHaveCount(1);

  await page.getByRole("banner").getByRole("button", { name: "Speed 1×" }).click();
  await page.getByRole("menuitemradio", { name: "5×", exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 700 } });
  await page.keyboard.press("Space");

  await expect(node(page, "Breaker")).toContainText("open", { timeout: 10_000 });
  const insights = inspector(page).getByRole("list", { name: "Insights" });
  await expect(insights).toContainText("Breaker is open.");
  await expect(insights).toContainText("so Payments gets a break");
  await expect(insights).toContainText("Limiter is turning away");

  await node(page, "Breaker").click();
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Breaker");
  await expect(inspector(page).getByRole("textbox", { name: "Opens at" })).toHaveValue("50");
  await expect(inspector(page).getByRole("region", { name: "Live summary" })).toContainText("open");
});
