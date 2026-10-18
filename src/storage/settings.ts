import type { LabDatabase } from "./db.ts";

/**
 * Known settings and the types we write. Reads are untrusted (anything could
 * be in the database), so preferences.ts validates them.
 */
export type Settings = {
  lastSystemId: string;
  /** We asked the browser to keep our data (navigator.storage.persist). */
  persistRequested: boolean;
  theme: "system" | "light" | "dark";
  minimap: boolean;
  collapsedGroups: string[];
  panels: { tier: string; paletteOpen: boolean; inspectorOpen: boolean };
  /** The welcome card was dismissed; it doesn't open on its own again. */
  welcomeSeen: boolean;
  timelineOpen: boolean;
};

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;

export function createSettingsRepository(db: LabDatabase) {
  return {
    /** Returns what's stored, unchecked; validate before trusting it. */
    async get<K extends keyof Settings>(key: K): Promise<unknown> {
      return (await db.settings.get(key))?.value;
    },
    async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
      await db.settings.put({ key, value });
    },
  };
}
