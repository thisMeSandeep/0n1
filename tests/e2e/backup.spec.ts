import { readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const banner = (page: Page) => page.getByRole("banner");
const palette = (page: Page) => page.getByRole("complementary", { name: "Components" });
const nodes = (page: Page) => page.locator(".react-flow__node");
const systemsList = (page: Page) => page.getByRole("list", { name: "Systems" });

async function openMenuItem(page: Page, name: string) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name }).click();
}

async function canvasSnapshot(page: Page) {
  return nodes(page).evaluateAll((els) =>
    els.map((el) => `${el.textContent} @ ${(el as HTMLElement).style.transform}`).sort(),
  );
}

async function restoreFile(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await openMenuItem(page, "Restore from backup…");
  await (await chooser).setFiles(path);
}

test("backs up every system, and restoring brings back identical designs", async ({
  page,
}, testInfo) => {
  await openLab(page);
  // A small system with two components, renamed.
  await palette(page).getByRole("button", { name: "Client", exact: true }).click();
  await palette(page).getByRole("button", { name: "Database", exact: true }).click();
  const name = page.getByRole("complementary", { name: "Inspector" });
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 40 } });
  await name.getByLabel("System name").fill("Checkout");
  await name.getByLabel("System name").press("Enter");
  await expect(banner(page).getByRole("status")).toHaveText("Saved");
  const checkout = await canvasSnapshot(page);

  // Back up everything.
  const download = page.waitForEvent("download");
  await openMenuItem(page, "Back up all systems");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^0n1-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = testInfo.outputPath("backup.json");
  await file.saveAs(path);
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup).toMatchObject({ format: "0n1-backup", version: 1 });
  expect(backup.systems.map((s: { name: string }) => s.name)).toEqual(["Checkout"]);

  // Clear everything, as if the browser's site data was wiped.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("0n1");
        request.onsuccess = request.onblocked = () => resolve();
      }),
  );
  await page.reload();
  await openLab(page);
  await expect(banner(page)).toContainText("Untitled system");
  await expect(nodes(page)).toHaveCount(0);

  // Restore it.
  await restoreFile(page, path);
  const dialog = page.getByRole("dialog", { name: "Restore “Checkout”?" });
  await expect(dialog).toContainText("Nothing is overwritten.");
  await dialog.getByRole("button", { name: "Restore system" }).click();
  await expect(dialog).toBeHidden();

  // Open it from the toast and compare.
  await page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(banner(page)).toContainText("Checkout");
  expect(await canvasSnapshot(page)).toEqual(checkout);
});

test("restoring the same backup twice adds copies alongside, never overwriting", async ({
  page,
}, testInfo) => {
  await openLab(page);
  const download = page.waitForEvent("download");
  await openMenuItem(page, "Back up all systems");
  const path = testInfo.outputPath("backup.json");
  await (await download).saveAs(path);

  await restoreFile(page, path);
  await page.getByRole("button", { name: "Restore system" }).click();
  await banner(page)
    .getByRole("button", { name: /open systems library/ })
    .click();
  await expect(systemsList(page).getByRole("listitem")).toHaveCount(2);
  await expect(systemsList(page)).toContainText("Untitled system 2");
});

test("backs up a single system from the library", async ({ page }) => {
  await openLab(page);
  await banner(page)
    .getByRole("button", { name: /open systems library/ })
    .click();
  const row = systemsList(page).getByRole("listitem").first();
  await row.hover();
  await row.getByRole("button", { name: /Actions for/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Back up this system" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^0n1-untitled-system-\d{4}-\d{2}-\d{2}\.json$/,
  );
});

test("a malformed file explains what's wrong and changes nothing", async ({ page }, testInfo) => {
  await openLab(page);
  const path = testInfo.outputPath("notes.json");
  await writeFile(path, '{ "hello": "world" }');

  await restoreFile(page, path);
  const dialog = page.getByRole("dialog", { name: "Couldn't restore “notes.json”" });
  await expect(dialog).toContainText("This file isn't a 0n1 backup.");
  await dialog.getByRole("button", { name: "Close" }).click();

  await banner(page)
    .getByRole("button", { name: /open systems library/ })
    .click();
  await expect(systemsList(page).getByRole("listitem")).toHaveCount(1);
});
