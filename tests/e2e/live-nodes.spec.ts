import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });
const card = (page: Page, name: string) => node(page, name).locator("[data-card]");
const clock = (page: Page) => page.getByRole("timer", { name: "Simulation time" });

/** Select a node by clicking it, then move focus off it so shortcuts apply. */
async function select(page: Page, name: string) {
  await node(page, name).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test("components show live numbers while running", async ({ page }) => {
  await openLab(page, "/?sample");
  await expect(card(page, "Links DB")).toContainText("Database");
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[2-9]/, { timeout: 5000 });
  await expect(card(page, "Users")).toContainText(/\/s\s*sent/);
  await expect(card(page, "Shortener API · 1")).toContainText(/p99/);
  await expect(card(page, "Link cache")).toContainText(/hit/);
  await expect(card(page, "Links DB")).toHaveAttribute("data-status", /healthy|busy|failing/);
});

test("K takes a component down and brings it back; so does its menu", async ({ page }) => {
  await openLab(page, "/?sample");
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[1-9]/, { timeout: 5000 });

  await select(page, "Shortener API · 2");
  await page.keyboard.press("k");
  await expect(card(page, "Shortener API · 2")).toHaveAttribute("data-status", "down");
  await expect(card(page, "Shortener API · 2")).toContainText(/Down since 00:0\d/);

  await page.keyboard.press("k");
  await expect(card(page, "Shortener API · 2")).not.toHaveAttribute("data-status", "down");

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: "Take down" }).click();
  await expect(card(page, "Shortener API · 2")).toHaveAttribute("data-status", "down");
  await inspector.getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: "Bring back" }).click();
  await expect(card(page, "Shortener API · 2")).not.toHaveAttribute("data-status", "down");
});

async function setTraffic(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: `Traffic ${from}` }).click();
  await page.getByRole("menuitemradio", { name: to, exact: true }).click();
  await page.getByRole("menu").waitFor({ state: "detached" });
}

test("more traffic makes the services busy, then overloads them", async ({ page }) => {
  await openLab(page, "/?sample");
  await setTraffic(page, "100%", "1000%");
  await page.keyboard.press("Space");
  const api = card(page, "Shortener API · 1");
  await expect(api).toHaveAttribute("data-status", "busy", { timeout: 10_000 });

  // 150 requests a second at 1000%: more than the two services can handle.
  await select(page, "Users");
  const rate = page
    .getByRole("complementary", { name: "Inspector" })
    .getByRole("textbox", { name: "Requests per second" });
  await rate.fill("150");
  await rate.press("Enter");
  await expect(api).toHaveAttribute("data-status", "failing", { timeout: 15_000 });
  await expect(node(page, "Shortener API · 1")).toContainText(/% errors/, { timeout: 15_000 });
});

test("resting the pointer on a running component shows its details", async ({ page }) => {
  await openLab(page, "/?sample");
  await page.keyboard.press("Space");
  await expect(clock(page)).toHaveText(/00:0[1-9]/, { timeout: 5000 });
  await node(page, "Links DB").hover();
  const details = node(page, "Links DB").locator("[data-hovercard]");
  await expect(details).toContainText("Waiting in line");
  await expect(details.getByRole("img", { name: /p99, recent values/ })).toBeVisible();
  await page.mouse.move(5, 300);
  await expect(details).toBeHidden();
});
