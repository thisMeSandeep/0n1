import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { checkConnection, connectionHint, edgeCounts } from "./connections.ts";
import { createSystemDocument, type SystemDocument } from "./document.ts";

function doc(): SystemDocument {
  const node = (id: string, type: string) => ({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    params: {},
  });
  return {
    ...createSystemDocument({ id: "s", now: 0 }),
    nodes: [node("client", "client"), node("svc", "service"), node("db", "database")],
    edges: [{ id: "e1", source: "client", target: "svc" }],
  };
}

describe("checkConnection", () => {
  it("allows what the component rules allow", () => {
    expect(checkConnection(doc(), registry, "svc", "db")).toEqual({ ok: true });
  });

  it("explains rule violations", () => {
    expect(checkConnection(doc(), registry, "db", "svc")).toEqual({
      ok: false,
      reason: "Database can't send requests to a service.",
    });
    expect(checkConnection(doc(), registry, "svc", "client")).toEqual({
      ok: false,
      reason: "Client doesn't take requests.",
    });
  });

  it("refuses self-loops, duplicates and missing components", () => {
    expect(checkConnection(doc(), registry, "svc", "svc")).toMatchObject({ reason: /itself/ });
    expect(checkConnection(doc(), registry, "client", "svc")).toMatchObject({
      reason: /already connected/,
    });
    expect(checkConnection(doc(), registry, "svc", "ghost")).toMatchObject({ ok: false });
  });

  it("allows the reverse of an existing connection only if the rules do", () => {
    expect(checkConnection(doc(), registry, "svc", "client").ok).toBe(false);
  });
});

describe("connectionHint", () => {
  const def = (type: string) => registry.require(type);

  it("asks unconnected components to be wired up", () => {
    expect(connectionHint(def("client"), 0, 0)).toMatch(/Drag from its right edge/);
    expect(connectionHint(def("cache"), 0, 0)).toMatch(/Connect something to it/);
  });

  it("flags components nothing sends to", () => {
    expect(connectionHint(def("database"), 0, 1)).toMatch(/sit idle/);
    expect(connectionHint(def("service"), 0, 2)).toMatch(/sit idle/);
  });

  it("flags pass-through components with nowhere to send", () => {
    expect(connectionHint(def("load-balancer"), 1, 0)).toMatch(/nowhere to send/);
    expect(connectionHint(def("queue"), 3, 0)).toMatch(/nowhere to send/);
  });

  it("is quiet when a component is wired up enough", () => {
    expect(connectionHint(def("client"), 0, 1)).toBeNull();
    expect(connectionHint(def("service"), 1, 0)).toBeNull();
    expect(connectionHint(def("database"), 2, 0)).toBeNull();
    expect(connectionHint(def("load-balancer"), 1, 2)).toBeNull();
  });
});

describe("edgeCounts", () => {
  it("counts incoming and outgoing connections per node", () => {
    const counts = edgeCounts({
      edges: [
        { id: "1", source: "a", target: "b" },
        { id: "2", source: "a", target: "c" },
        { id: "3", source: "b", target: "c" },
      ],
    });
    expect(counts.get("a")).toEqual({ incoming: 0, outgoing: 2 });
    expect(counts.get("b")).toEqual({ incoming: 1, outgoing: 1 });
    expect(counts.get("c")).toEqual({ incoming: 2, outgoing: 0 });
  });
});
