// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  findShortcut,
  formatCombo,
  matchesCombo,
  SHORTCUT_IDS,
  SHORTCUTS,
  shortcutKeys,
  shouldHandle,
} from "./shortcuts.ts";

const press = (
  key: string,
  mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
) => ({
  key,
  metaKey: Boolean(mods.meta),
  ctrlKey: Boolean(mods.ctrl),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
});

const idFor = (event: ReturnType<typeof press>, mac = true) => findShortcut(event, mac)?.id ?? null;

describe("registry", () => {
  it("has every id exactly once", () => {
    expect(SHORTCUTS.map((s) => s.id).sort()).toEqual([...SHORTCUT_IDS].sort());
  });

  it("never maps one key press to two shortcuts", () => {
    const seen = new Map<string, string>();
    for (const shortcut of SHORTCUTS) {
      for (const combo of shortcut.combos) {
        const key = JSON.stringify({
          k: combo.key.toLowerCase(),
          m: !!combo.mod,
          s: !!combo.shift,
        });
        expect(seen.get(key), `${shortcut.id} clashes with ${seen.get(key)}`).toBeUndefined();
        seen.set(key, shortcut.id);
      }
    }
  });
});

describe("matching", () => {
  it.each([
    [press("k", { meta: true }), "commandPalette"],
    [press("?", { shift: true }), "shortcuts"],
    [press("/"), "searchComponents"],
    [press("z", { meta: true }), "undo"],
    [press("Z", { meta: true, shift: true }), "redo"],
    [press("y", { meta: true }), "redo"],
    [press("d", { meta: true }), "duplicate"],
    [press("Backspace"), "delete"],
    [press("Delete"), "delete"],
    [press("a", { meta: true }), "selectAll"],
    [press("Escape"), "deselect"],
    [press("ArrowLeft"), "move"],
    [press("ArrowUp", { shift: true }), "move"],
    [press("f"), "fitView"],
    [press("1"), "zoomToActual"],
    [press("m"), "toggleMinimap"],
    [press("["), "togglePalette"],
    [press("]"), "toggleInspector"],
  ])("%o → %s", (event, id) => {
    expect(idFor(event)).toBe(id);
  });

  it("uses Ctrl instead of ⌘ off the Mac", () => {
    expect(idFor(press("z", { ctrl: true }), false)).toBe("undo");
    expect(idFor(press("z", { meta: true }), false)).toBeNull();
    expect(idFor(press("z", { ctrl: true }), true)).toBeNull();
  });

  it("needs the exact modifiers for letters", () => {
    expect(idFor(press("F", { shift: true }))).toBeNull();
    expect(idFor(press("f", { meta: true }))).toBeNull();
    expect(idFor(press("d"))).toBeNull();
    expect(idFor(press("z", { meta: true, alt: true }))).toBeNull();
  });

  it("matches combos directly", () => {
    expect(matchesCombo(press("k", { ctrl: true }), { key: "k", mod: true }, false)).toBe(true);
  });
});

describe("shouldHandle", () => {
  const undo = SHORTCUTS.find((s) => s.id === "undo")!;
  const palette = SHORTCUTS.find((s) => s.id === "commandPalette")!;

  it("ignores ordinary shortcuts while typing", () => {
    expect(shouldHandle(undo, document.createElement("input"))).toBe(false);
    expect(shouldHandle(undo, document.createElement("textarea"))).toBe(false);
    expect(shouldHandle(undo, document.body)).toBe(true);
  });

  it("ignores ordinary shortcuts inside menus and dialogs", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    expect(shouldHandle(undo, button)).toBe(false);
  });

  it("always handles global shortcuts", () => {
    expect(shouldHandle(palette, document.createElement("input"))).toBe(true);
  });
});

describe("formatting", () => {
  it("uses symbols on Mac and words elsewhere", () => {
    expect(formatCombo({ key: "z", mod: true, shift: true }, true)).toBe("⌘⇧Z");
    expect(formatCombo({ key: "z", mod: true, shift: true }, false)).toBe("Ctrl+Shift+Z");
    expect(formatCombo({ key: "Backspace" }, true)).toBe("⌫");
    expect(formatCombo({ key: "Backspace" }, false)).toBe("Backspace");
    expect(formatCombo({ key: "[" }, false)).toBe("[");
  });

  it("gives a shortcut's primary keys", () => {
    expect(shortcutKeys("duplicate", true)).toBe("⌘D");
    expect(shortcutKeys("duplicate", false)).toBe("Ctrl+D");
    expect(shortcutKeys("fitView", true)).toBe("F");
  });
});
