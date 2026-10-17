import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const node = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: new RegExp(`^${name}`) });

test.beforeEach(async ({ page }) => {
  await page.goto("/?sample");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("shows the system when nothing is selected, and renames it", async ({ page }) => {
  await expect(inspector(page)).toContainText("6 components · 7 connections");
  const name = inspector(page).getByLabel("System name");
  await name.fill("Short links");
  await name.press("Enter");
  await expect(page.getByRole("banner")).toContainText("Short links");
});

test("selecting a component shows its settings, and edits apply to it", async ({ page }) => {
  await node(page, "Links DB").click();
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Links DB");
  await expect(inspector(page)).toContainText("Database");
  for (const section of ["About", "Capacity", "When things go wrong"]) {
    await expect(inspector(page).getByRole("heading", { name: section })).toBeVisible();
  }

  const connections = inspector(page).getByRole("textbox", { name: "Connections" });
  await connections.fill("120");
  await connections.press("Enter");
  // Re-select to prove the value lives in the document, not just the field.
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 40 } });
  await node(page, "Links DB").click();
  await expect(inspector(page).getByRole("textbox", { name: "Connections" })).toHaveValue("120");
  await expect(inspector(page).getByRole("button", { name: "Reset to 50" })).toBeAttached();
});

test("renaming in the inspector renames the node on the canvas", async ({ page }) => {
  await node(page, "Link cache").click();
  const name = inspector(page).getByLabel("Component name");
  await name.fill("Hot links");
  await name.press("Enter");
  await expect(node(page, "Hot links")).toBeVisible();
});

test("“How it's modelled” opens the honest modelling note", async ({ page }) => {
  await node(page, "Link cache").click();
  await inspector(page).getByRole("button", { name: "How it's modelled" }).click();
  await expect(inspector(page)).toContainText("The hit ratio isn't a setting");
});

test("the component menu duplicates and deletes", async ({ page }) => {
  await node(page, "Links DB").click();
  await inspector(page).getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(inspector(page).getByLabel("Component name")).toHaveValue("Links DB 2");

  await inspector(page).getByRole("button", { name: "Component actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(inspector(page)).toContainText("6 components");
});

test("selecting a connection shows where it goes, and can delete it", async ({ page }) => {
  // The sample's first connection is Users → Load balancer.
  await page.locator(".react-flow__edge").first().click({ force: true });
  await expect(inspector(page)).toContainText("Connection");
  await expect(inspector(page)).toContainText("Users → Load balancer");

  await inspector(page).getByRole("button", { name: "Delete connection" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);
});

test("several selected items show a count and bulk actions", async ({ page }) => {
  await node(page, "Link cache").click();
  await node(page, "Links DB").click({ modifiers: ["Shift"] });
  await expect(inspector(page)).toContainText("2 selected");
  await inspector(page).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
});

test.describe("below 1440px", () => {
  test.use({ viewport: { width: 1300, height: 900 } });

  test("selecting a component opens the floating inspector", async ({ page }) => {
    await expect(inspector(page)).toBeHidden();
    await node(page, "Users").click();
    await expect(inspector(page)).toBeVisible();
    await expect(inspector(page).getByLabel("Component name")).toHaveValue("Users");
  });
});
