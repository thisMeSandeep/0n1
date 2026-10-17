import {
  createSystemDocument,
  DEFAULT_SYSTEM_NAME,
  type SystemDocument,
} from "../model/document.ts";
import type { SystemsRepository } from "../storage/systems.ts";
import { type DesignStore, uniqueName } from "../store/design.ts";

type LibraryDeps = {
  systems: SystemsRepository;
  store: DesignStore;
  /** Store the open system's pending edits before switching away from it. */
  flush: () => Promise<void>;
  now?: () => number;
  newId?: () => string;
};

export type DeletedSystem = { restore: () => Promise<void> };

/**
 * Library operations over the saved systems and the open one. A system is
 * always open: deleting the last one opens a fresh blank system.
 */
export function createLibraryActions({
  systems,
  store,
  flush,
  now = Date.now,
  newId = () => crypto.randomUUID(),
}: LibraryDeps) {
  const current = () => store.getState().doc;

  /** The latest version of a system: the open one may have unsaved edits. */
  const latest = async (id: string) => (id === current().id ? current() : await systems.get(id));

  const takenNames = async () => new Set((await systems.list()).map((s) => s.name));

  async function create(name?: string): Promise<SystemDocument> {
    const doc = createSystemDocument({
      name: name ?? uniqueName(DEFAULT_SYSTEM_NAME, await takenNames()),
      id: newId(),
      now: now(),
    });
    await systems.save(doc);
    return doc;
  }

  async function open(id: string): Promise<void> {
    if (id === current().id) return;
    const doc = await systems.get(id);
    if (!doc) throw new Error("That system no longer exists.");
    await flush();
    store.getState().load(doc);
  }

  return {
    /** Every saved system for a backup, with the open one's unsaved edits. Unreadable ones are left out. */
    async collectAll(): Promise<SystemDocument[]> {
      const docs: SystemDocument[] = [];
      for (const summary of await systems.list()) {
        try {
          const doc = await latest(summary.id);
          if (doc) docs.push(doc);
        } catch (error) {
          console.warn(`0n1: leaving unreadable system ${summary.id} out of the backup`, error);
        }
      }
      if (!docs.some((d) => d.id === current().id)) docs.unshift(current());
      return docs;
    },

    /** The latest version of one system, for backing it up. */
    latest,

    /**
     * Add systems from a backup. Each gets a new id, so nothing existing is
     * ever overwritten, and a unique name ("Checkout 2" if "Checkout" exists).
     */
    async restore(docs: readonly SystemDocument[]): Promise<SystemDocument[]> {
      const taken = await takenNames();
      const restored: SystemDocument[] = [];
      for (const doc of docs) {
        const name = uniqueName(doc.name, taken);
        taken.add(name);
        const copy = { ...structuredClone(doc), id: newId(), name };
        await systems.save(copy);
        restored.push(copy);
      }
      return restored;
    },

    /** A new blank system, opened. */
    async createAndOpen(): Promise<void> {
      await flush();
      store.getState().load(await create());
    },

    open,

    async rename(id: string, name: string): Promise<boolean> {
      if (id === current().id) return store.getState().renameSystem(name);
      const trimmed = name.trim();
      const doc = await systems.get(id);
      if (!doc || trimmed === "" || trimmed.length > 80) return false;
      await systems.save({ ...doc, name: trimmed, meta: { ...doc.meta, updatedAt: now() } });
      return true;
    },

    /** A copy named "… copy", saved next to the original. Stays on the current system. */
    async duplicate(id: string): Promise<SystemDocument | null> {
      const source = await latest(id);
      if (!source) return null;
      const time = now();
      const copy: SystemDocument = {
        ...structuredClone(source),
        id: newId(),
        name: uniqueName(`${source.name} copy`, await takenNames()),
        meta: { createdAt: time, updatedAt: time },
      };
      await systems.save(copy);
      return copy;
    },

    /**
     * Delete a system. Returns a way to undo it. Deleting the open system
     * switches to the most recent other one, or a new blank system.
     */
    async remove(id: string): Promise<DeletedSystem | null> {
      const wasOpen = id === current().id;
      if (wasOpen) await flush();
      const snapshot = await latest(id);
      if (!snapshot) return null;

      let replacement: string | null = null;
      if (wasOpen) {
        const next = (await systems.list()).find((s) => s.id !== id);
        const doc = next ? await systems.get(next.id) : null;
        if (doc) {
          store.getState().load(doc);
        } else {
          const blank = await create(DEFAULT_SYSTEM_NAME);
          replacement = blank.id;
          store.getState().load(blank);
        }
      }
      await systems.remove(id);

      return {
        async restore() {
          await systems.save(snapshot);
          if (!wasOpen) return;
          await flush();
          store.getState().load(snapshot);
          // Clean up the blank system made to replace it, if it was never used.
          if (replacement) {
            const blank = await systems.get(replacement);
            if (blank && blank.nodes.length === 0 && blank.name === DEFAULT_SYSTEM_NAME) {
              await systems.remove(replacement);
            }
          }
        },
      };
    },
  };
}

export type LibraryActions = ReturnType<typeof createLibraryActions>;
