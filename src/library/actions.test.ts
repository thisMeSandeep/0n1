// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BLUEPRINT_FILES } from "../blueprints/catalog.ts";
import { type Blueprint, parseBlueprint } from "../blueprints/format.ts";
import { registry } from "../components/index.ts";
import { createSystemDocument } from "../model/document.ts";
import { LabDatabase } from "../storage/db.ts";
import { createSystemsRepository } from "../storage/systems.ts";
import { createDesignStore } from "../store/design.ts";
import { createLibraryActions } from "./actions.ts";

let db: LabDatabase;
let n = 0;
beforeEach(async () => {
  db = new LabDatabase(`library-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

async function setup() {
  const systems = createSystemsRepository(db);
  const first = createSystemDocument({ id: "first", name: "First", now: 1 });
  await systems.save(first);
  let id = 0;
  let clock = 100;
  const tick = () => ++clock;
  const store = createDesignStore({ registry, doc: first, now: tick });
  const flushes: string[] = [];
  const library = createLibraryActions({
    systems,
    store,
    registry,
    // Stand-in for autosave: store whatever is open.
    flush: async () => {
      flushes.push(store.getState().doc.id);
      await systems.save(store.getState().doc);
    },
    newId: () => `id${++id}`,
    now: tick,
  });
  const names = async () => (await systems.list()).map((s) => s.name);
  const open = () => store.getState().doc;
  return { systems, store, library, names, open, flushes };
}

describe("library actions", () => {
  it("opens a blueprint as a copy that can be edited and saved without touching the original", async () => {
    const { library, open, store, systems, flushes } = await setup();
    const shipped = structuredClone(BLUEPRINT_FILES["url-shortener.json"]);
    const blueprint: Blueprint = parseBlueprint(BLUEPRINT_FILES["url-shortener.json"], registry);

    const copy = await library.createFromBlueprint(blueprint);
    expect(flushes).toEqual(["first"]); // the open system was saved first
    expect(open()).toBe(copy);
    expect(copy).toMatchObject({
      id: "id1",
      name: "URL shortener",
      blueprint: { id: "url-shortener" },
    });
    expect(await systems.get("id1")).toEqual(copy);

    // Edit the copy and save it: the blueprint, and the file it came from, stay as shipped.
    const users = open().nodes.find((n) => n.type === "client")?.id as string;
    store.getState().updateParams(users, { rate: 5000 });
    store.getState().renameNode(users, "Everyone");
    store
      .getState()
      .removeNodes([open().nodes.find((n) => n.type === "load-balancer")?.id as string]);
    await systems.save(open());
    expect(BLUEPRINT_FILES["url-shortener.json"]).toEqual(shipped);
    expect(blueprint.system.nodes).toHaveLength(5);

    // Opening it again makes a second, untouched copy.
    const again = await library.createFromBlueprint(blueprint);
    expect(again).toMatchObject({ id: "id2", name: "URL shortener 2" });
    expect(again.nodes).toHaveLength(5);
    expect(again.nodes.find((n) => n.type === "client")?.name).toBe("Users");
    expect((await systems.get("id1"))?.nodes).toHaveLength(4);
  });

  it("creates and opens numbered blank systems, saving the old one first", async () => {
    const { library, names, open, store, flushes, systems } = await setup();
    store.getState().addNode("cache", { x: 0, y: 0 });

    await library.createAndOpen();
    expect(open().name).toBe("Untitled system");
    expect(flushes).toEqual(["first"]);
    expect((await systems.get("first"))?.nodes).toHaveLength(1);

    await library.createAndOpen();
    expect(open().name).toBe("Untitled system 2");
    expect(await names()).toEqual(["Untitled system 2", "Untitled system", "First"]);
  });

  it("opens another system", async () => {
    const { library, open, systems } = await setup();
    await systems.save(createSystemDocument({ id: "other", name: "Other", now: 50 }));
    await library.open("other");
    expect(open().id).toBe("other");
    await expect(library.open("ghost")).rejects.toThrow("no longer exists");
  });

  it("renames the open system through the store, and others in the database", async () => {
    const { library, open, systems } = await setup();
    await systems.save(createSystemDocument({ id: "other", name: "Other", now: 50 }));

    expect(await library.rename("first", "Checkout")).toBe(true);
    expect(open().name).toBe("Checkout");

    expect(await library.rename("other", "  Payments  ")).toBe(true);
    expect((await systems.get("other"))?.name).toBe("Payments");
    expect(await library.rename("other", " ")).toBe(false);
  });

  it("duplicates with unsaved edits and a unique name, without switching", async () => {
    const { library, store, open, systems } = await setup();
    store.getState().addNode("database", { x: 0, y: 0 });

    const copy = await library.duplicate("first");
    expect(copy?.name).toBe("First copy");
    expect((await systems.get(copy!.id))?.nodes).toHaveLength(1);
    expect(open().id).toBe("first");

    expect((await library.duplicate("first"))?.name).toBe("First copy 2");
  });

  it("deletes another system, and undo restores it", async () => {
    const { library, systems, names } = await setup();
    await systems.save(createSystemDocument({ id: "other", name: "Other", now: 50 }));

    const deleted = await library.remove("other");
    expect(await names()).toEqual(["First"]);
    await deleted?.restore();
    expect(await names()).toContain("Other");
  });

  it("deleting the open system switches to the most recent other one", async () => {
    const { library, systems, open } = await setup();
    await systems.save(createSystemDocument({ id: "older", name: "Older", now: 0 }));
    await systems.save(createSystemDocument({ id: "newer", name: "Newer", now: 50 }));

    const deleted = await library.remove("first");
    expect(open().id).toBe("newer");
    expect(await systems.get("first")).toBeNull();

    await deleted?.restore();
    expect(open().id).toBe("first");
  });

  it("deleting the only system opens a blank one, cleaned up again on undo", async () => {
    const { library, store, systems, open, names } = await setup();
    store.getState().addNode("queue", { x: 0, y: 0 });

    const deleted = await library.remove("first");
    expect(open().name).toBe("Untitled system");
    expect(await names()).toEqual(["Untitled system"]);

    await deleted?.restore();
    expect(open().id).toBe("first");
    expect(open().nodes).toHaveLength(1);
    expect(await names()).toEqual(["First"]);
    expect(await systems.list()).toHaveLength(1);
  });

  it("collects every system for a backup, with the open one's unsaved edits", async () => {
    const { library, store, systems } = await setup();
    await systems.save(createSystemDocument({ id: "other", name: "Other", now: 50 }));
    store.getState().addNode("cache", { x: 0, y: 0 });

    const docs = await library.collectAll();
    expect(docs.map((d) => d.id).sort()).toEqual(["first", "other"]);
    expect(docs.find((d) => d.id === "first")?.nodes).toHaveLength(1);
  });

  it("restores systems with new ids and unique names, never overwriting", async () => {
    const { library, systems, names } = await setup();
    const backup = [
      { ...createSystemDocument({ id: "first", name: "First", now: 10 }), nodes: [] },
      createSystemDocument({ id: "x", name: "Imported", now: 20 }),
    ];

    const restored = await library.restore(backup);
    expect(restored.map((d) => d.name)).toEqual(["First 2", "Imported"]);
    expect(restored.every((d) => d.id !== "first" && d.id !== "x")).toBe(true);
    expect((await systems.get("first"))?.name).toBe("First");
    expect((await names()).sort()).toEqual(["First", "First 2", "Imported"]);
  });
});
