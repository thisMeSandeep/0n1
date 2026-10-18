import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const banner = (page: Page) => page.getByRole("banner");
const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const pillCost = (page: Page) =>
  page.getByRole("region", { name: "System vitals" }).locator('[data-vital="est. cost"]');

/** "$1.2k/mo" → 1200. */
const dollars = (text: string | null) => {
  const match = /\$([\d.]+)(k|M)?/.exec(text ?? "");
  if (!match) throw new Error(`Not a cost: ${text}`);
  return Number(match[1]) * (match[2] === "k" ? 1e3 : match[2] === "M" ? 1e6 : 1);
};

test("the estimated cost shows in the vitals pill, follows the settings, and is explained", async ({
  page,
}) => {
  await openLab(page);
  const library = banner(page).getByRole("button", { name: /open systems library/ });
  await library.click();
  await page.getByRole("button", { name: "New system" }).click();
  await page.getByRole("menuitem", { name: /^URL shortener/ }).click();
  await expect(library).toContainText("URL shortener");

  // Before any run, from the clients' rates.
  await expect(pillCost(page)).toHaveText(/^\$[\d.]+k?\/mo$/);
  const before = dollars(await pillCost(page).textContent());
  expect(before).toBeGreaterThan(0);
  await expect(inspector(page).getByRole("list", { name: "Cost by component" })).toContainText(
    "Links DB",
  );
  await expect(inspector(page)).toContainText("An estimate at typical cloud list prices");

  // A bigger database costs more, straight away.
  await node(page, "Links DB").click();
  const drivers = inspector(page).getByRole("definition").first();
  await expect(inspector(page).getByRole("heading", { name: "Estimated cost" })).toBeVisible();
  await expect(drivers).toHaveText(/^\$\d+$/);
  const connections = inspector(page).getByRole("textbox", { name: "Connections" });
  await connections.fill("200");
  await connections.press("Enter");
  await expect(inspector(page).getByText("8 vCPUs, for 200 connections")).toBeVisible();
  await expect
    .poll(async () => dollars(await pillCost(page).textContent()))
    .toBeGreaterThan(before);

  // While running, it follows the run's traffic.
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 40 } });
  await page.keyboard.press("Space");
  await expect(inspector(page)).toContainText("from the traffic in this run", { timeout: 10_000 });
  await expect(pillCost(page)).toHaveText(/^\$[\d.]+k?\/mo$/);
});
