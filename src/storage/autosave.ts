import { createSystemDocument, type SystemDocument } from "../model/document.ts";
import type { DesignStore } from "../store/design.ts";
import type { SaveStatus } from "../store/ui.ts";
import type { SettingsRepository } from "./settings.ts";
import type { SystemsRepository } from "./systems.ts";

/**
 * The system to open on startup: the last one opened, else the most
 * recently edited, else a new "Untitled system" (saved straight away).
 * An unreadable record is left untouched, never overwritten.
 */
export async function openInitialSystem(
  systems: SystemsRepository,
  settings: SettingsRepository,
): Promise<SystemDocument> {
  const tryGet = async (id: string) => {
    try {
      return await systems.get(id);
    } catch (error) {
      console.warn(`0n1: could not open system ${id}`, error);
      return null;
    }
  };

  const lastId = await settings.get("lastSystemId");
  const last = typeof lastId === "string" ? await tryGet(lastId) : null;
  if (last) return last;

  for (const summary of await systems.list()) {
    const doc = await tryGet(summary.id);
    if (doc) return doc;
  }

  const doc = createSystemDocument();
  await systems.save(doc);
  return doc;
}

type AutosaveOptions = {
  store: DesignStore;
  systems: SystemsRepository;
  settings: SettingsRepository;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  /** Injectable for tests; defaults to navigator.storage.persist. */
  requestPersistence?: () => Promise<boolean>;
};

const defaultPersist = () => navigator.storage?.persist?.() ?? Promise.resolve(false);

/**
 * Save the open system shortly after each edit. Pending saves are flushed
 * when another system is opened and when the page is hidden, so nothing is
 * lost on tab close. Returns a function that stops autosaving.
 */
export function startAutosave({
  store,
  systems,
  settings,
  onStatus,
  delayMs = 500,
  requestPersistence = defaultPersist,
}: AutosaveOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SystemDocument | null = null;
  let persistAsked = false;

  const write = async (doc: SystemDocument) => {
    try {
      await systems.save(doc);
      if (pending === null) onStatus("saved");
      if (!persistAsked) {
        persistAsked = true;
        if (!(await settings.get("persistRequested"))) {
          await settings.set("persistRequested", true);
          await requestPersistence().catch(() => false);
        }
      }
    } catch (error) {
      console.error("0n1: autosave failed", error);
      onStatus("error");
    }
  };

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const doc = pending;
    pending = null;
    if (doc) return write(doc);
    return Promise.resolve();
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.doc === previous.doc) return;
    if (state.doc.id !== previous.doc.id) {
      // Another system was opened: save what was pending for the old one, remember the new one.
      void flush();
      void settings.set("lastSystemId", state.doc.id);
      onStatus("saved");
      return;
    }
    pending = state.doc;
    onStatus("saving");
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });

  const onHide = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  void settings.set("lastSystemId", store.getState().doc.id);

  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flush);
    void flush();
  };
}
