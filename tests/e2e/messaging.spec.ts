import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

/** Users (resolving at DNS) → Signup API → Signups, which Indexer and a slow Mailer subscribe to. */
function signupsBackup() {
  const at = (x: number, y: number) => ({ x, y });
  const now = Date.now();
  return {
    format: "0n1-backup",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    systems: [
      {
        schemaVersion: 1,
        id: "signups",
        name: "Signups",
        meta: { createdAt: now, updatedAt: now },
        nodes: [
          {
            id: "users",
            type: "client",
            name: "Users",
            position: at(0, 160),
            params: { rate: 50, readShare: 0 },
          },
          { id: "dns", type: "dns", name: "DNS", position: at(0, 400), params: { ttl: 30 } },
          { id: "api", type: "service", name: "Signup API", position: at(272, 160), params: {} },
          { id: "events", type: "pubsub", name: "Signups", position: at(544, 160), params: {} },
          {
            id: "indexer",
            type: "worker",
            name: "Indexer",
            position: at(816, 40),
            params: { concurrency: 8, workTime: 10 },
          },
          {
            id: "mailer",
            type: "worker",
            name: "Mailer",
            position: at(816, 280),
            params: { concurrency: 1, workTime: 200 },
          },
        ],
        edges: [
          { id: "e1", source: "users", target: "dns" },
          { id: "e2", source: "users", target: "api" },
          { id: "e3", source: "api", target: "events" },
          { id: "e4", source: "events", target: "indexer" },
          { id: "e5", source: "events", target: "mailer" },
        ],
      },
    ],
  };
}

test("pub/sub and DNS are in the palette", async ({ page }) => {
  await openLab(page);
  const palette = page.getByRole("complementary", { name: "Components" });
  for (const name of ["Pub/sub", "DNS"]) {
    await expect(palette.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
});

test("a slow subscriber falls behind on its own, and a DNS outage doesn't break anything at first", async ({
  page,
}, testInfo) => {
  await openLab(page);
  const file = testInfo.outputPath("signups.json");
  await writeFile(file, JSON.stringify(signupsBackup()));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Restore from backup…" }).click();
  await (await chooser).setFiles(file);
  await page.getByRole("button", { name: "Restore system" }).click();
  await page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(node(page, "Mailer")).toHaveCount(1);

  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 700 } });
  await page.keyboard.press("Space");

  const insights = inspector(page).getByRole("list", { name: "Insights" });
  await expect(insights).toContainText("Mailer is falling behind on Signups.", {
    timeout: 15_000,
  });
  await expect(insights).toContainText("The other subscribers aren't held up.");

  await node(page, "Signups").click();
  await inspector(page).getByRole("button", { name: "Details" }).click();
  await expect(inspector(page).getByText("Waiting for Mailer")).toBeVisible();
  await expect(inspector(page).getByText("Waiting for Indexer")).toBeVisible();

  // Take DNS down: users with a cached answer carry on.
  await node(page, "DNS").click();
  await page.keyboard.press("k");
  await expect(node(page, "DNS")).toContainText(/down/i);
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 700 } });
  await expect(insights).toContainText("DNS is down.", { timeout: 10_000 });
  await expect(insights).toContainText(/Users with a cached answer carry on.*\d+% still have one/);
});
