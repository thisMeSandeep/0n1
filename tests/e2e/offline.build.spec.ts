import { readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { BUILD_DIR } from "./build.ts";
import { openLab } from "./helpers.ts";

/*
 * The installable offline app (S47). These run against a production build
 * (playwright.config.ts): only it has a service worker.
 */

test.use({ viewport: { width: 1440, height: 900 } });
// One at a time: a test below plays a new deploy, which every open lab would see.
test.describe.configure({ mode: "serial" });

const banner = (page: Page) => page.getByRole("banner");
const library = (page: Page) => banner(page).getByRole("button", { name: /open systems library/ });

async function openBlueprint(page: Page, title: string) {
  await library(page).click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${title}`) }).click();
  await expect(library(page)).toContainText(title);
  await expect(banner(page).getByRole("status")).toHaveText("Saved");
}

/** Wait until the service worker has the whole app cached and is in charge. */
async function cached(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("No active service worker");
  });
}

test("after the first visit, the lab opens offline with its saved systems, and runs", async ({
  page,
  context,
}) => {
  await openLab(page);
  await openBlueprint(page, "URL shortener");
  await openBlueprint(page, "Job pipeline");
  await cached(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(library(page)).toContainText("Job pipeline");
  await library(page).click();
  const systems = page.getByRole("list", { name: "Systems" });
  await expect(systems).toContainText("URL shortener");
  await expect(systems).toContainText("Job pipeline");
  await page.keyboard.press("Escape");

  // The fonts came from the cache too.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(fonts.some((family) => family.includes("IBM Plex Sans"))).toBe(true);

  // The simulation worker and the lazy charts work offline.
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 40 } });
  await page.keyboard.press("Space");
  await expect(page.getByRole("timer")).not.toHaveText("00:00");
  await expect(
    page.getByRole("region", { name: "System vitals" }).locator('[data-vital="throughput"]'),
  ).toHaveText(/\d.*\/s/);
  await expect(page.getByRole("img", { name: "Throughput over time" })).toBeVisible();
});

test("the manifest is valid and the app is installable", async ({ page }) => {
  await openLab(page);
  await cached(page);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return null;
    return (await fetch(link.href)).json();
  });
  expect(manifest).toMatchObject({
    name: "0n1",
    short_name: "0n1",
    start_url: "/",
    display: "standalone",
  });
  const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[];
  expect(icons.map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ""}`)).toEqual([
    "192x192",
    "512x512",
    "512x512 maskable",
  ]);
  // Each icon is there, at the size it says.
  for (const icon of icons) {
    const size = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }

  // Chrome's own verdict.
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

test("a new version is offered with a quiet toast, and Reload keeps the latest edit", async ({
  page,
}) => {
  await openLab(page);
  await cached(page);
  // Deploy a "new version": the same service worker, changed by a few bytes.
  // (The browser fetches it itself, out of reach of page routes.)
  const file = `${BUILD_DIR}/sw.js`;
  const original = await readFile(file, "utf8");
  await writeFile(file, `${original}\n// next version\n`);
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await newVersionOffered(page);
  } finally {
    await writeFile(file, original);
  }
});

async function newVersionOffered(page: Page) {
  const notice = page.getByRole("region", { name: /Notifications/ });
  await expect(notice).toContainText("A new version of 0n1 is ready", { timeout: 15_000 });
  // It never reloads on its own.
  await page.waitForTimeout(1000);
  await expect(notice).toContainText("A new version of 0n1 is ready");

  // An edit made just before reloading is kept.
  const name = page.getByRole("complementary", { name: "Inspector" }).getByLabel("System name");
  await name.fill("Kept across the update");
  await name.press("Enter");
  const reloaded = page.waitForEvent("load");
  await notice.getByRole("button", { name: "Reload" }).click();
  await reloaded;
  await expect(banner(page).getByRole("status")).toHaveText("Saved");
  await expect(library(page)).toContainText("Kept across the update");
  await expect(notice).not.toContainText("A new version");
}
