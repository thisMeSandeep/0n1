import { expect, type Page } from "@playwright/test";

/**
 * Open the lab and wait until it's ready for input. The app reads IndexedDB
 * before its first render, so keys pressed straight after `goto` can land
 * before the lab exists.
 */
export async function openLab(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator(".react-flow")).toBeVisible();
  if (!path.includes("sample")) {
    await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
  }
}
