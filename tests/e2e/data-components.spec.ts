import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

/** Shoppers → API → range-sharded Orders DB (→ Search), and Image viewers → CDN → Images. */
function shopBackup() {
  const at = (x: number, y: number) => ({ x, y });
  const now = Date.now();
  return {
    format: "0n1-backup",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    systems: [
      {
        schemaVersion: 1,
        id: "shop",
        name: "Shop",
        meta: { createdAt: now, updatedAt: now },
        nodes: [
          {
            id: "shoppers",
            type: "client",
            name: "Shoppers",
            position: at(0, 120),
            params: { rate: 1500, searchShare: 20, readShare: 90, timeout: 5000 },
          },
          {
            id: "api",
            type: "service",
            name: "Shop API",
            position: at(272, 120),
            params: { concurrency: 1024, workTime: 2 },
          },
          {
            id: "orders",
            type: "sharded-database",
            name: "Orders DB",
            position: at(544, 40),
            params: { shards: 4, spread: "range", connections: 10, readTime: 8 },
          },
          {
            id: "search",
            type: "search-index",
            name: "Search",
            position: at(816, 200),
            params: {},
          },
          {
            id: "viewers",
            type: "client",
            name: "Image viewers",
            position: at(0, 420),
            params: { rate: 500, readShare: 100 },
          },
          { id: "cdn", type: "cdn", name: "CDN", position: at(272, 420), params: { hitRatio: 85 } },
          {
            id: "images",
            type: "object-storage",
            name: "Images",
            position: at(544, 420),
            params: {},
          },
        ],
        edges: [
          { id: "e1", source: "shoppers", target: "api" },
          { id: "e2", source: "api", target: "orders" },
          { id: "e3", source: "api", target: "search" },
          { id: "e4", source: "orders", target: "search" },
          { id: "e5", source: "viewers", target: "cdn" },
          { id: "e6", source: "cdn", target: "images" },
        ],
      },
    ],
  };
}

test("the data components are in the palette", async ({ page }) => {
  await openLab(page);
  const palette = page.getByRole("complementary", { name: "Components" });
  for (const name of ["Sharded database", "Search index", "Object storage"]) {
    await expect(palette.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
});

test("range sharding piles popular keys onto one shard, and 0n1 says so", async ({
  page,
}, testInfo) => {
  await openLab(page);
  const file = testInfo.outputPath("shop.json");
  await writeFile(file, JSON.stringify(shopBackup()));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Restore from backup…" }).click();
  await (await chooser).setFiles(file);
  await page.getByRole("button", { name: "Restore system" }).click();
  await page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(node(page, "Orders DB")).toHaveCount(1);

  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 700 } });
  await page.keyboard.press("Space");

  const insights = inspector(page).getByRole("list", { name: "Insights" });
  await expect(insights).toContainText("Orders DB has a shard with no free connections.", {
    timeout: 15_000,
  });
  await expect(insights).toContainText(/Shard 1 of 4 is \d+% busy; the others average \d+%/);
  await expect(insights).toContainText("Spread keys by hash");

  await node(page, "Orders DB").click();
  await inspector(page).getByRole("button", { name: "Details" }).click();
  await expect(inspector(page).getByText("Busiest shard")).toBeVisible();
  await expect(node(page, "Search")).toContainText("/s");
  await expect(node(page, "Images")).toContainText("/s");
});
