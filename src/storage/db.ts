import Dexie, { type EntityTable } from "dexie";

/**
 * The browser database. Everything 0n1 stores lives here, in this browser
 * only. Bump the Dexie version and add an upgrade whenever tables or indexes
 * change; document shape changes go through model/migrate.ts instead.
 */

export type SystemRecord = {
  id: string;
  name: string;
  /** The system document as last saved. Read back through migrate(). */
  doc: unknown;
  createdAt: number;
  updatedAt: number;
};

export type SettingRecord = { key: string; value: unknown };

export class LabDatabase extends Dexie {
  systems!: EntityTable<SystemRecord, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor(name = "0n1") {
    super(name);
    this.version(1).stores({
      systems: "id, updatedAt",
      settings: "key",
    });
  }
}
