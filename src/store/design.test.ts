import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument, systemDocumentSchema } from "../model/document.ts";
import { copyName, createDesignStore, hasCustomParams, uniqueName } from "./design.ts";

function setup() {
  let next = 0;
  let clock = 1000;
  const store = createDesignStore({
    registry,
    doc: createSystemDocument({ id: "sys", now: clock }),
    newId: () => `id${++next}`,
    now: () => ++clock,
  });
  const actions = store.getState();
  const doc = () => store.getState().doc;
  const history = () => store.temporal.getState();
  const node = (id: string) => doc().nodes.find((n) => n.id === id);
  return { store, actions, doc, history, node };
}

describe("uniqueName", () => {
  it("adds the first free number", () => {
    expect(uniqueName("Cache", new Set())).toBe("Cache");
    expect(uniqueName("Cache", new Set(["Cache"]))).toBe("Cache 2");
    expect(uniqueName("Cache", new Set(["Cache", "Cache 2"]))).toBe("Cache 3");
  });
});

describe("design store", () => {
  it("adds components with default params and unique names", () => {
    const { actions, node, doc } = setup();
    const a = actions.addNode("service", { x: 10, y: 20 });
    const b = actions.addNode("service", { x: 300, y: 20 });

    expect(node(a)).toMatchObject({
      type: "service",
      name: "Service",
      position: { x: 10, y: 20 },
      params: { concurrency: 16, workTime: 20, maxWaiting: 1000, errorRate: 0 },
    });
    expect(node(b)?.name).toBe("Service 2");
    expect(() => actions.addNode("teleporter", { x: 0, y: 0 })).toThrow("Unknown component type");
    expect(systemDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("stamps updatedAt on every edit", () => {
    const { actions, doc } = setup();
    const before = doc().meta.updatedAt;
    actions.addNode("cache", { x: 0, y: 0 });
    expect(doc().meta.updatedAt).toBeGreaterThan(before);
  });

  it("moves nodes and ignores moves that change nothing", () => {
    const { actions, node, history } = setup();
    const a = actions.addNode("cache", { x: 0, y: 0 });
    actions.moveNodes([{ id: a, position: { x: 50, y: 60 } }]);
    expect(node(a)?.position).toEqual({ x: 50, y: 60 });

    const steps = history().pastStates.length;
    actions.moveNodes([{ id: a, position: { x: 50, y: 60 } }]);
    expect(history().pastStates.length).toBe(steps);
  });

  it("renames nodes and the system, rejecting blank names", () => {
    const { actions, node, doc } = setup();
    const a = actions.addNode("database", { x: 0, y: 0 });

    expect(actions.renameNode(a, "  Links DB  ")).toBe(true);
    expect(node(a)?.name).toBe("Links DB");
    expect(actions.renameNode(a, "   ")).toBe(false);
    expect(actions.renameNode(a, "x".repeat(81))).toBe(false);
    expect(node(a)?.name).toBe("Links DB");

    expect(actions.renameSystem("URL shortener")).toBe(true);
    expect(doc().name).toBe("URL shortener");
    expect(actions.renameSystem("")).toBe(false);
  });

  it("updates params within the component's schema and rejects invalid values", () => {
    const { actions, node } = setup();
    const a = actions.addNode("database", { x: 0, y: 0 });

    expect(actions.updateParams(a, { connections: 100 })).toBe(true);
    expect(node(a)?.params.connections).toBe(100);
    expect(node(a)?.params.readTime).toBe(5);

    expect(actions.updateParams(a, { connections: 0 })).toBe(false);
    expect(actions.updateParams(a, { connections: "lots" })).toBe(false);
    expect(actions.updateParams("missing", { connections: 10 })).toBe(false);
    expect(node(a)?.params.connections).toBe(100);
  });

  describe("connections", () => {
    function graph() {
      const s = setup();
      const client = s.actions.addNode("client", { x: 0, y: 0 });
      const service = s.actions.addNode("service", { x: 200, y: 0 });
      const db = s.actions.addNode("database", { x: 400, y: 0 });
      return { ...s, client, service, db };
    }

    it("connects components the rules allow", () => {
      const { actions, doc, client, service } = graph();
      const result = actions.connect(client, service);
      expect(result).toEqual({ ok: true, edgeId: expect.any(String) });
      expect(doc().edges).toEqual([
        { id: (result as { edgeId: string }).edgeId, source: client, target: service },
      ]);
    });

    it("refuses connections the rules forbid, with the reason", () => {
      const { actions, doc, client, service, db } = graph();
      expect(actions.connect(db, service)).toEqual({
        ok: false,
        reason: "Database can't send requests to a service.",
      });
      expect(actions.connect(db, client)).toEqual({
        ok: false,
        reason: "Client doesn't take requests.",
      });
      expect(actions.connect(service, client)).toEqual({
        ok: false,
        reason: "Client doesn't take requests.",
      });
      expect(doc().edges).toEqual([]);
    });

    it("refuses self, duplicate and dangling connections", () => {
      const { actions, service, db } = graph();
      expect(actions.connect(service, service)).toMatchObject({ ok: false, reason: /itself/ });
      actions.connect(service, db);
      expect(actions.connect(service, db)).toMatchObject({
        ok: false,
        reason: /already connected/,
      });
      expect(actions.connect(service, "ghost")).toMatchObject({ ok: false });
    });

    it("disconnects edges and removes edges with their nodes", () => {
      const { actions, doc, client, service, db } = graph();
      const e1 = actions.connect(client, service);
      actions.connect(service, db);

      if (e1.ok) actions.disconnect([e1.edgeId]);
      expect(doc().edges.map((e) => [e.source, e.target])).toEqual([[service, db]]);

      actions.removeNodes([db]);
      expect(doc().nodes.map((n) => n.id)).toEqual([client, service]);
      expect(doc().edges).toEqual([]);
    });
  });

  it("duplicates nodes with the connections between them, offset and renamed", () => {
    const { actions, doc, node } = setup();
    const svc = actions.addNode("service", { x: 0, y: 0 });
    const db = actions.addNode("database", { x: 200, y: 0 });
    const client = actions.addNode("client", { x: -200, y: 0 });
    actions.connect(client, svc);
    actions.connect(svc, db);
    actions.updateParams(svc, { concurrency: 64 });

    const [svcCopy, dbCopy] = actions.duplicateNodes([svc, db]);

    expect(node(svcCopy!)).toMatchObject({
      name: "Service 2",
      position: { x: 32, y: 32 },
      params: { concurrency: 64 },
    });
    expect(node(dbCopy!)?.name).toBe("Database 2");
    // Only the edge inside the copied set is duplicated.
    expect(doc().edges.filter((e) => e.source === svcCopy)).toMatchObject([{ target: dbCopy }]);
    expect(doc().edges.filter((e) => e.target === svcCopy)).toEqual([]);

    const [again] = actions.duplicateNodes([svcCopy!]);
    expect(node(again!)?.name).toBe("Service 3");
    expect(systemDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("names copies after their originals, numbering on", () => {
    const taken = new Set([
      "Service",
      "Service 2",
      "Shortener API · 1",
      "Shortener API · 2",
      "Links DB",
    ]);
    expect(copyName("Cache", taken)).toBe("Cache"); // free: kept
    expect(copyName("Service", taken)).toBe("Service 3");
    expect(copyName("Service 2", taken)).toBe("Service 3");
    expect(copyName("Shortener API · 1", taken)).toBe("Shortener API · 3");
    expect(copyName("Links DB", taken)).toBe("Links DB 2");
  });

  it("pastes nodes from anywhere: new ids, free names, allowed connections, one undo step", () => {
    const { actions, doc, node, history } = setup();
    actions.addNode("service", { x: 0, y: 0 }); // "Service" is taken here
    const before = history().pastStates.length;
    const ids = actions.pasteNodes(
      [
        { id: "a", type: "client", name: "Users", position: { x: 0, y: 0 }, params: { rate: 50 } },
        { id: "b", type: "service", name: "Service", position: { x: 300, y: 0 }, params: {} },
        { id: "c", type: "database", name: "DB", position: { x: 600, y: 0 }, params: {} },
        { id: "x", type: "teleporter", name: "Portal", position: { x: 0, y: 0 }, params: {} },
      ],
      [
        { source: "a", target: "b" },
        { source: "a", target: "b" }, // twice
        { source: "b", target: "c" },
        { source: "a", target: "c" }, // a client can't send to a database
        { source: "b", target: "x" }, // to a kind this version doesn't know
      ],
      { x: 10, y: 20 },
    );
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("a");
    expect(node(ids[0]!)).toMatchObject({
      name: "Users",
      position: { x: 10, y: 20 },
      params: { rate: 50 },
    });
    expect(node(ids[1]!)?.name).toBe("Service 2");
    expect(doc().edges.map((e) => [e.source, e.target])).toEqual([
      [ids[0], ids[1]],
      [ids[1], ids[2]],
    ]);
    expect(history().pastStates.length).toBe(before + 1);
    expect(systemDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("adds, edits, moves and removes sticky notes, each one undo step", () => {
    const { actions, doc, history } = setup();
    const svc = actions.addNode("service", { x: 0, y: 0 });
    const note = actions.addNote({ x: 10, y: 20 });
    expect(doc().notes).toEqual([{ id: note, text: "", position: { x: 10, y: 20 } }]);

    expect(actions.updateNote(note, "Watch the database")).toBe(true);
    expect(actions.updateNote(note, "x".repeat(5000))).toBe(false); // too long
    expect(actions.updateNote("gone", "hi")).toBe(false);
    expect(doc().notes?.[0]?.text).toBe("Watch the database");

    // Moving and removing take notes and components together.
    actions.moveNodes([
      { id: note, position: { x: 100, y: 200 } },
      { id: svc, position: { x: 50, y: 50 } },
    ]);
    expect(doc().notes?.[0]?.position).toEqual({ x: 100, y: 200 });
    expect(doc().nodes[0]?.position).toEqual({ x: 50, y: 50 });
    // Duplicating copies components only.
    expect(actions.duplicateNodes([note])).toEqual([]);

    const before = history().pastStates.length;
    actions.removeNodes([note, svc]);
    expect(doc().notes).toEqual([]);
    expect(doc().nodes).toEqual([]);
    expect(history().pastStates.length).toBe(before + 1);
    history().undo();
    expect(doc().notes?.[0]?.text).toBe("Watch the database");
    expect(systemDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("resets every setting of components to its default, in one undo step", () => {
    const { actions, node, history } = setup();
    const svc = actions.addNode("service", { x: 0, y: 0 });
    const db = actions.addNode("database", { x: 300, y: 0 });
    const service = registry.require("service");
    expect(hasCustomParams(node(svc)!, service)).toBe(false);
    expect(hasCustomParams({ params: {} }, service)).toBe(false); // missing means default

    actions.updateParams(svc, { concurrency: 64, workTime: 5 });
    actions.updateParams(db, { connections: 8 });
    expect(hasCustomParams(node(svc)!, service)).toBe(true);
    actions.renameNode(svc, "Orders API");

    const before = history().pastStates.length;
    actions.resetParams([svc, db]);
    expect(node(svc)?.params).toEqual(defaultParams(service));
    expect(node(db)?.params).toEqual(defaultParams(registry.require("database")));
    expect(node(svc)?.name).toBe("Orders API"); // only settings
    expect(history().pastStates.length).toBe(before + 1);

    actions.resetParams([svc]); // nothing left to reset: no step
    expect(history().pastStates.length).toBe(before + 1);
    history().undo();
    expect(node(svc)?.params).toMatchObject({ concurrency: 64, workTime: 5 });
  });

  describe("undo / redo", () => {
    it("undoes and redoes each edit as one step", () => {
      const { actions, doc, history } = setup();
      const a = actions.addNode("cache", { x: 0, y: 0 });
      actions.renameNode(a, "Link cache");

      history().undo();
      expect(doc().nodes[0]?.name).toBe("Cache");
      history().undo();
      expect(doc().nodes).toEqual([]);

      history().redo();
      history().redo();
      expect(doc().nodes[0]?.name).toBe("Link cache");
    });

    it("groups a whole drag into a single step", () => {
      const { actions, node, history } = setup();
      const a = actions.addNode("cache", { x: 0, y: 0 });
      const steps = history().pastStates.length;

      actions.beginGesture();
      for (let x = 1; x <= 20; x++) actions.moveNodes([{ id: a, position: { x, y: x } }]);
      actions.endGesture();

      expect(history().pastStates.length).toBe(steps + 1);
      expect(node(a)?.position).toEqual({ x: 20, y: 20 });
      history().undo();
      expect(node(a)?.position).toEqual({ x: 0, y: 0 });
      history().redo();
      expect(node(a)?.position).toEqual({ x: 20, y: 20 });
    });

    it("records nothing for a drag that doesn't move anything", () => {
      const { actions, history } = setup();
      actions.addNode("cache", { x: 0, y: 0 });
      const steps = history().pastStates.length;
      actions.beginGesture();
      actions.endGesture();
      expect(history().pastStates.length).toBe(steps);
      expect(history().isTracking).toBe(true);
    });

    it("a new edit clears the redo stack", () => {
      const { actions, history } = setup();
      actions.addNode("cache", { x: 0, y: 0 });
      history().undo();
      expect(history().futureStates.length).toBe(1);
      actions.addNode("queue", { x: 0, y: 0 });
      expect(history().futureStates.length).toBe(0);
    });

    it("does not record rejected or no-op actions", () => {
      const { actions, history } = setup();
      const a = actions.addNode("database", { x: 0, y: 0 });
      const steps = history().pastStates.length;
      actions.updateParams(a, { connections: -1 });
      actions.updateParams(a, { connections: 50 });
      actions.renameNode(a, "Database");
      actions.removeNodes(["ghost"]);
      actions.disconnect(["ghost"]);
      expect(history().pastStates.length).toBe(steps);
    });

    it("loading another system replaces the document and clears history", () => {
      const { actions, doc, history } = setup();
      actions.addNode("cache", { x: 0, y: 0 });
      actions.load(createSystemDocument({ id: "other", name: "Job pipeline", now: 1 }));
      expect(doc()).toMatchObject({ id: "other", name: "Job pipeline", nodes: [] });
      expect(history().pastStates).toEqual([]);
    });

    it("keeps at most the history limit", () => {
      const store = createDesignStore({
        registry,
        doc: createSystemDocument({ id: "s", now: 0 }),
        historyLimit: 3,
      });
      for (let i = 0; i < 6; i++) store.getState().addNode("cache", { x: i, y: 0 });
      expect(store.temporal.getState().pastStates.length).toBe(3);
    });
  });

  describe("the chaos timeline", () => {
    it("adds events in time order, edits and removes them, with undo", () => {
      const { store } = setup();
      const api = store.getState().addNode("service", { x: 0, y: 0 });
      const later = store
        .getState()
        .addEvent({ kind: "down", at: 20_000, target: api, duration: 5000 });
      store.getState().addEvent({ kind: "surge", at: 5000, factor: 3, duration: 10_000 });
      expect(store.getState().doc.scenario?.events.map((e) => e.at)).toEqual([5000, 20_000]);

      expect(
        store
          .getState()
          .updateEvent(later, { kind: "down", at: 1000, target: api, duration: null }),
      ).toBe(true);
      expect(store.getState().doc.scenario?.events.map((e) => e.kind)).toEqual(["down", "surge"]);
      expect(
        store.getState().updateEvent(later, { kind: "surge", at: -5, factor: 3, duration: 1 }),
      ).toBe(false);

      store.getState().removeEvent(later);
      expect(store.getState().doc.scenario?.events).toHaveLength(1);
      store.temporal.getState().undo();
      expect(store.getState().doc.scenario?.events).toHaveLength(2);
    });

    it("drops events aimed at components or connections that are removed", () => {
      const { store } = setup();
      const a = store.getState().addNode("client", { x: 0, y: 0 });
      const b = store.getState().addNode("service", { x: 300, y: 0 });
      const link = store.getState().connect(a, b);
      if (!link.ok) throw new Error("couldn't connect");
      store.getState().addEvent({ kind: "cut", at: 1000, target: link.edgeId, duration: 1000 });
      store.getState().addEvent({ kind: "slow", at: 1000, target: b, factor: 2, duration: 1000 });
      store.getState().addEvent({ kind: "surge", at: 1000, factor: 2, duration: 1000 });

      store.getState().disconnect([link.edgeId]);
      expect(store.getState().doc.scenario?.events.map((e) => e.kind)).toEqual(["slow", "surge"]);
      store.getState().removeNodes([b]);
      expect(store.getState().doc.scenario?.events.map((e) => e.kind)).toEqual(["surge"]);
    });
  });
});
