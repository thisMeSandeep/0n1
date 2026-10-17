import type { LabDatabase } from "./db.ts";

/** Known settings and their value types. S16 adds the rest. */
export type Settings = {
  lastSystemId: string;
  /** We asked the browser to keep our data (navigator.storage.persist). */
  persistRequested: boolean;
};

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;

export function createSettingsRepository(db: LabDatabase) {
  return {
    async get<K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> {
      return (await db.settings.get(key))?.value as Settings[K] | undefined;
    },
    async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
      await db.settings.put({ key, value });
    },
  };
}
