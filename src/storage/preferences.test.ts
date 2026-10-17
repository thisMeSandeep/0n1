// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUiStore } from "../store/ui.ts";
import { LabDatabase } from "./db.ts";
import {
  bindPreferences,
  loadPreferences,
  readThemeMirror,
  THEME_MIRROR_KEY,
  writeThemeMirror,
} from "./preferences.ts";
import { createSettingsRepository } from "./settings.ts";

let db: LabDatabase;
let n = 0;
beforeEach(async () => {
  db = new LabDatabase(`prefs-${++n}`);
  await db.open();
  localStorage.clear();
});
afterEach(async () => {
  await db.delete();
});

describe("loadPreferences", () => {
  it("uses defaults on first run", async () => {
    expect(await loadPreferences(createSettingsRepository(db))).toEqual({
      theme: "system",
      minimap: false,
      collapsedGroups: [],
      panels: null,
    });
  });

  it("reads what was saved", async () => {
    const settings = createSettingsRepository(db);
    await settings.set("theme", "dark");
    await settings.set("minimap", true);
    await settings.set("collapsedGroups", ["data", "messaging"]);
    await settings.set("panels", { tier: "wide", paletteOpen: false, inspectorOpen: true });
    expect(await loadPreferences(settings)).toEqual({
      theme: "dark",
      minimap: true,
      collapsedGroups: ["data", "messaging"],
      panels: { tier: "wide", paletteOpen: false, inspectorOpen: true },
    });
  });

  it("falls back to defaults for anything malformed", async () => {
    await db.settings.bulkPut([
      { key: "theme", value: "purple" },
      { key: "minimap", value: "yes" },
      { key: "collapsedGroups", value: ["data", "teleporters"] },
      { key: "panels", value: { tier: "huge" } },
    ]);
    expect(await loadPreferences(createSettingsRepository(db))).toEqual({
      theme: "system",
      minimap: false,
      collapsedGroups: [],
      panels: null,
    });
  });
});

describe("bindPreferences", () => {
  it("applies loaded preferences, then saves each change", async () => {
    const settings = createSettingsRepository(db);
    const ui = createUiStore();
    const stop = bindPreferences(ui, settings, {
      minimap: true,
      collapsedGroups: ["compute"],
      panels: null,
    });
    expect(ui.getState()).toMatchObject({ minimap: true, collapsedGroups: ["compute"] });

    ui.getState().toggleMinimap();
    ui.getState().setGroupOpen("compute", true);
    ui.getState().setGroupOpen("data", false);
    ui.getState().setPanels({ tier: "medium", paletteOpen: true, inspectorOpen: false });

    await vi.waitFor(async () => {
      const prefs = await loadPreferences(settings);
      expect(prefs).toMatchObject({
        minimap: false,
        collapsedGroups: ["data"],
        panels: { tier: "medium", paletteOpen: true, inspectorOpen: false },
      });
    });
    stop();
  });
});

describe("theme mirror", () => {
  it("round-trips through localStorage, rejecting junk", () => {
    expect(readThemeMirror()).toBeNull();
    writeThemeMirror("dark");
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe("dark");
    expect(readThemeMirror()).toBe("dark");
    localStorage.setItem(THEME_MIRROR_KEY, "neon");
    expect(readThemeMirror()).toBeNull();
  });
});
