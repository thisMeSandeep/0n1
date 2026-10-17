// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defaultPanels, isTypingTarget, tierFor } from "./layout.ts";

describe("tierFor", () => {
  it("picks the largest matching tier", () => {
    expect(tierFor({ wide: true, medium: true, narrow: true })).toBe("wide");
    expect(tierFor({ wide: false, medium: true, narrow: true })).toBe("medium");
    expect(tierFor({ wide: false, medium: false, narrow: true })).toBe("narrow");
    expect(tierFor({ wide: false, medium: false, narrow: false })).toBe("small");
  });
});

describe("defaultPanels", () => {
  it("docks both panels open on wide screens", () => {
    expect(defaultPanels("wide")).toEqual({
      paletteOpen: true,
      inspectorOpen: true,
      inspectorDocked: true,
    });
  });

  it("overlays a closed inspector below 1440px", () => {
    expect(defaultPanels("medium")).toMatchObject({ paletteOpen: true, inspectorDocked: false });
    expect(defaultPanels("medium").inspectorOpen).toBe(false);
  });

  it("collapses the palette to a rail below 1280px", () => {
    expect(defaultPanels("narrow").paletteOpen).toBe(false);
  });
});

describe("isTypingTarget", () => {
  it("is true inside text fields and editable content", () => {
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editable.append(inner);

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
  });

  it("is false for other elements and non-elements", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
