import { expect, type Page } from "@playwright/test";

/**
 * Open the lab and wait until it's ready for input. The app reads IndexedDB
 * before its first render, so keys pressed straight after `goto` can land
 * before the lab exists. A first visit's welcome card is closed unless
 * `keepWelcome` is set.
 */
export async function openLab(page: Page, path = "/", { keepWelcome = false } = {}) {
  await page.goto(path);
  await expect(page.locator(".react-flow")).toBeVisible();
  if (!path.includes("sample")) {
    await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
    // A fresh browser is a first visit: close the welcome card unless the test is about it.
    const close = page.getByRole("button", { name: "Close welcome" });
    if (!keepWelcome && (await close.isVisible())) await close.click();
  }
}

/** Read a value from the lab's settings table in IndexedDB. */
export function storedSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("0n1");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("settings").objectStore("settings").get(key);
          request.onsuccess = () => {
            resolve((request.result as { value?: unknown } | undefined)?.value ?? null);
            open.result.close();
          };
        };
      }),
    key,
  );
}
