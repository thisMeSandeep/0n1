import { designStore, uiStore } from "../store/index.ts";
import type { SaveStatus } from "../store/ui.ts";
import type { ThemePreference } from "../ui/theme/theme.ts";
import { type Autosave, openInitialSystem, startAutosave } from "./autosave.ts";
import { LabDatabase } from "./db.ts";
import {
  bindPreferences,
  loadPreferences,
  readThemeMirror,
  writeThemeMirror,
} from "./preferences.ts";
import { createSettingsRepository } from "./settings.ts";
import { createSystemsRepository } from "./systems.ts";

export const db = new LabDatabase();
export const systems = createSystemsRepository(db);
export const settings = createSettingsRepository(db);

let autosave: Autosave | null = null;

/**
 * Open the last system, restore preferences and start autosaving. Returns
 * the theme to start with. If the browser won't give us storage (some
 * private modes), the lab still works but nothing is kept.
 */
export async function startStorage(): Promise<ThemePreference> {
  const setStatus = (status: SaveStatus) => uiStore.getState().setSaveStatus(status);
  try {
    await db.open();
    const [doc, prefs] = await Promise.all([
      openInitialSystem(systems, settings),
      loadPreferences(settings),
    ]);
    designStore.getState().load(doc);
    bindPreferences(uiStore, settings, prefs);
    autosave = startAutosave({ store: designStore, systems, settings, onStatus: setStatus });
    setStatus("saved");
    // The synchronous mirror can be newer than IndexedDB (see preferences.ts).
    const theme = readThemeMirror() ?? prefs.theme;
    if (theme !== prefs.theme) void settings.set("theme", theme);
    writeThemeMirror(theme);
    return theme;
  } catch (error) {
    console.error("0n1: storage unavailable", error);
    setStatus("unavailable");
    // Nothing is kept between visits, so every visit is a first visit.
    uiStore.getState().setWelcomeOpen(true);
    return readThemeMirror() ?? "system";
  }
}

/** Remember the user's theme choice. */
export function saveThemePreference(theme: ThemePreference): void {
  writeThemeMirror(theme);
  if (autosave) void settings.set("theme", theme);
}

/** Whether systems are being stored in this browser. */
export function isStorageAvailable(): boolean {
  return autosave !== null;
}

/** Store any pending edit to the open system now. */
export function flushPendingSave(): Promise<void> {
  return autosave?.flush() ?? Promise.resolve();
}
