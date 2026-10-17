import { describe, expect, it } from "vitest";
import { applyTheme, resolveTheme } from "./theme.ts";

describe("resolveTheme", () => {
  it("follows the system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("uses an explicit preference regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets data-theme on the root element", () => {
    const root = { dataset: {} } as HTMLElement;
    applyTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
  });
});
