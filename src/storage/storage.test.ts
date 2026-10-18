// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registry } from "../components/index.ts";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";
import { MigrationError } from "../model/migrate.ts";
import { createDesignStore } from "../store/design.ts";
import type { SaveStatus } from "../store/ui.ts";
import { openInitialSystem, startAutosave } from "./autosave.ts";
import { LabDatabase } from "./db.ts";
import { createSettingsRepository } from "./settings.ts";
import { createSystemsRepository } from "./systems.ts";

let db: LabDatabase;
let n = 0;
beforeEach(async () => {
  db = new LabDatabase(`test-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const doc = (id: string, name: string, updatedAt: number): SystemDocument => ({
  ...createSystemDocument({ id, name, now: 1 }),
  meta: { createdAt: 1, updatedAt },
});

describe("systems repository", () => {
  it("saves, gets, lists newest first, and removes", async () => {
    const systems = createSystemsRepository(db);
    await systems.save(doc("a", "Old", 100));
    await systems.save(doc("b", "New", 200));

    expect(await systems.get("a")).toEqual(doc("a", "Old", 100));
    expect((await systems.list()).map((s) => s.name)).toEqual(["New", "Old"]);

    await systems.save({ ...doc("a", "Old, edited", 300) });
    expect((await systems.list()).map((s) => [s.id, s.name])).toEqual([
      ["a", "Old, edited"],
      ["b", "New"],
    ]);

    await systems.remove("b");
    expect((await systems.list()).map((s) => s.id)).toEqual(["a"]);
    expect(await systems.get("b")).toBeNull();
  });

  it("lists each system's layout, for its thumbnail, even from a record it can't read", async () => {
    const systems = createSystemsRepository(db);
    await systems.save({
      ...doc("a", "Two", 100),
      nodes: [
        { id: "u", type: "client", name: "Users", position: { x: 0, y: 0 }, params: {} },
        { id: "s", type: "service", name: "API", position: { x: 272, y: 16 }, params: {} },
      ],
      edges: [{ id: "e", source: "u", target: "s" }],
    });
    await db.systems.put({
      id: "bad",
      name: "Bad",
      doc: { nonsense: true },
      createdAt: 0,
      updatedAt: 0,
    });
    expect((await systems.list()).map((s) => s.layout)).toEqual([
      {
        nodes: [
          { id: "u", type: "client", x: 0, y: 0 },
          { id: "s", type: "service", x: 272, y: 16 },
        ],
        edges: [{ source: "u", target: "s" }],
      },
      { nodes: [], edges: [] },
    ]);
  });

  it("validates on read and refuses unreadable records", async () => {
    await db.systems.put({
      id: "bad",
      name: "Bad",
      doc: { nonsense: true },
      createdAt: 0,
      updatedAt: 0,
    });
    await expect(createSystemsRepository(db).get("bad")).rejects.toBeInstanceOf(MigrationError);
  });
});

describe("settings repository", () => {
  it("stores and reads values", async () => {
    const settings = createSettingsRepository(db);
    expect(await settings.get("lastSystemId")).toBeUndefined();
    await settings.set("lastSystemId", "abc");
    expect(await settings.get("lastSystemId")).toBe("abc");
  });
});

describe("openInitialSystem", () => {
  it("creates and saves an Untitled system on first run", async () => {
    const systems = createSystemsRepository(db);
    const opened = await openInitialSystem(systems, createSettingsRepository(db));
    expect(opened.name).toBe("Untitled system");
    expect(await systems.get(opened.id)).toEqual(opened);
  });

  it("reopens the last opened system", async () => {
    const systems = createSystemsRepository(db);
    const settings = createSettingsRepository(db);
    await systems.save(doc("a", "A", 100));
    await systems.save(doc("b", "B", 200));
    await settings.set("lastSystemId", "a");
    expect((await openInitialSystem(systems, settings)).id).toBe("a");
  });

  it("falls back to the most recent system, skipping unreadable ones without touching them", async () => {
    const systems = createSystemsRepository(db);
    const settings = createSettingsRepository(db);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await systems.save(doc("ok", "Fine", 100));
    await db.systems.put({ id: "bad", name: "Bad", doc: {}, createdAt: 0, updatedAt: 999 });
    await settings.set("lastSystemId", "missing");

    expect((await openInitialSystem(systems, settings)).id).toBe("ok");
    expect(await db.systems.get("bad")).toBeDefined();
  });
});

describe("autosave", () => {
  function setup() {
    const systems = createSystemsRepository(db);
    const settings = createSettingsRepository(db);
    const store = createDesignStore({ registry, doc: doc("sys", "System", 1) });
    const statuses: SaveStatus[] = [];
    const requestPersistence = vi.fn(async () => true);
    const { stop, flush } = startAutosave({
      store,
      systems,
      settings,
      onStatus: (s) => statuses.push(s),
      delayMs: 20,
      requestPersistence,
    });
    return { systems, settings, store, statuses, requestPersistence, stop, flush };
  }

  it("saves shortly after edits, debounced, and reports saving then saved", async () => {
    const { systems, store, statuses, stop } = setup();
    const save = vi.spyOn(systems, "save");
    store.getState().addNode("cache", { x: 0, y: 0 });
    store.getState().addNode("queue", { x: 300, y: 0 });
    expect(statuses.at(-1)).toBe("saving");

    await vi.waitFor(() => expect(statuses.at(-1)).toBe("saved"));
    expect(save).toHaveBeenCalledTimes(1);
    expect((await systems.get("sys"))?.nodes.map((n) => n.type)).toEqual(["cache", "queue"]);
    stop();
  });

  it("asks the browser to keep our data once, on the first save", async () => {
    const { store, settings, requestPersistence, stop } = setup();
    store.getState().addNode("cache", { x: 0, y: 0 });
    await vi.waitFor(() => expect(requestPersistence).toHaveBeenCalledTimes(1));
    store.getState().addNode("cache", { x: 100, y: 0 });
    await new Promise((r) => setTimeout(r, 60));
    expect(requestPersistence).toHaveBeenCalledTimes(1);
    expect(await settings.get("persistRequested")).toBe(true);
    stop();
  });

  it("flushes a pending save when another system is opened, and remembers it", async () => {
    const { systems, settings, store, stop } = setup();
    store.getState().addNode("cache", { x: 0, y: 0 });
    store.getState().load(doc("other", "Other", 5));

    await vi.waitFor(async () => expect((await systems.get("sys"))?.nodes).toHaveLength(1));
    await vi.waitFor(async () => expect(await settings.get("lastSystemId")).toBe("other"));
    stop();
  });

  it("flushes when the page is hidden", async () => {
    const { systems, store, stop } = setup();
    store.getState().renameSystem("Renamed");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(async () => expect((await systems.get("sys"))?.name).toBe("Renamed"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    stop();
  });

  it("flush() resolves once the pending change is stored", async () => {
    const { systems, store, flush, stop } = setup();
    store.getState().renameSystem("Flushed");
    await flush();
    expect((await systems.get("sys"))?.name).toBe("Flushed");
    stop();
  });

  it("reports an error when saving fails", async () => {
    const { systems, store, statuses, stop } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(systems, "save").mockRejectedValueOnce(new Error("quota"));
    store.getState().addNode("cache", { x: 0, y: 0 });
    await vi.waitFor(() => expect(statuses.at(-1)).toBe("error"));
    stop();
  });
});
