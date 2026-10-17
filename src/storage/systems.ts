import type { SystemDocument } from "../model/document.ts";
import { migrate } from "../model/migrate.ts";
import type { LabDatabase } from "./db.ts";

export type SystemSummary = { id: string; name: string; createdAt: number; updatedAt: number };

export type SystemsRepository = ReturnType<typeof createSystemsRepository>;

/** CRUD for saved systems. Reads always migrate and validate. */
export function createSystemsRepository(db: LabDatabase) {
  return {
    /** Create or update. */
    async save(doc: SystemDocument): Promise<void> {
      await db.systems.put({
        id: doc.id,
        name: doc.name,
        doc,
        createdAt: doc.meta.createdAt,
        updatedAt: doc.meta.updatedAt,
      });
    },

    /** The system, upgraded to the current schema; null if it doesn't exist. Throws MigrationError if unreadable. */
    async get(id: string): Promise<SystemDocument | null> {
      const record = await db.systems.get(id);
      return record ? migrate(record.doc) : null;
    },

    /** Most recently edited first. */
    async list(): Promise<SystemSummary[]> {
      const records = await db.systems.orderBy("updatedAt").reverse().toArray();
      return records.map(({ id, name, createdAt, updatedAt }) => ({
        id,
        name,
        createdAt,
        updatedAt,
      }));
    },

    async remove(id: string): Promise<void> {
      await db.systems.delete(id);
    },
  };
}
