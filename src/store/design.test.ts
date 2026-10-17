import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { createSystemDocument, systemDocumentSchema } from "../model/document.ts";
import { createDesignStore, uniqueName } from "./design.ts";

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
});
