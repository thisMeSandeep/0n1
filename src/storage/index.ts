import { designStore, uiStore } from "../store/index.ts";
import type { SaveStatus } from "../store/ui.ts";
import { openInitialSystem, startAutosave } from "./autosave.ts";
import { LabDatabase } from "./db.ts";
import { createSettingsRepository } from "./settings.ts";
import { createSystemsRepository } from "./systems.ts";

export const db = new LabDatabase();
export const systems = createSystemsRepository(db);
export const settings = createSettingsRepository(db);

/**
 * Open the last system and start autosaving. If the browser won't give us
 * storage (some private modes), the lab still works but nothing is kept.
 */
export async function startStorage(): Promise<void> {
  const setStatus = (status: SaveStatus) => uiStore.getState().setSaveStatus(status);
  try {
    await db.open();
    designStore.getState().load(await openInitialSystem(systems, settings));
    startAutosave({ store: designStore, systems, settings, onStatus: setStatus });
    setStatus("saved");
  } catch (error) {
    console.error("0n1: storage unavailable", error);
    setStatus("unavailable");
  }
}
