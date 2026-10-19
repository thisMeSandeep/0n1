import type { NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { SystemNode } from "../model/document.ts";
import { applySelectChanges, positionMoves, toFlowEdges, toFlowNodes } from "./flow.ts";

const docNode = (id: string, x = 0): SystemNode => ({
  id,
  type: "cache",
  name: `Cache ${id}`,
  position: { x, y: 0 },
  params: {},
});

const UNCONNECTED = "Not connected yet. Connect something to it so it gets requests.";

describe("toFlowNodes", () => {
  it("maps document nodes, with selection from the store", () => {
    const nodes = toFlowNodes([], [docNode("a"), docNode("b", 100)], [], new Set(["b"]));
    expect(nodes).toEqual([
      {
        id: "a",
        type: "component",
        position: { x: 0, y: 0 },
        data: { name: "Cache a", type: "cache", hint: UNCONNECTED },
        selected: false,
      },
      {
        id: "b",
        type: "component",
        position: { x: 100, y: 0 },
        data: { name: "Cache b", type: "cache", hint: UNCONNECTED },
        selected: true,
      },
    ]);
  });

  it("updates hints from connections, and reuses unchanged data", () => {
    const service = { ...docNode("svc"), type: "service", name: "API" };
    const edges = [{ id: "e", source: "svc", target: "a" }];
    const first = toFlowNodes([], [service, docNode("a")], edges, new Set());
    // The cache now gets requests; the service still has nothing sending to it.
    expect(first.map((n) => ("hint" in n.data ? n.data.hint : undefined))).toEqual([
      expect.stringMatching(/sit idle/),
      null,
    ]);

    const again = toFlowNodes(first, [service, docNode("a", 50)], edges, new Set());
    expect(again[1]?.data).toBe(first[1]?.data);
  });

  it("keeps what React Flow measured, but takes position and data from the document", () => {
    const [first] = toFlowNodes([], [docNode("a")], [], new Set());
    const measured = { ...first!, measured: { width: 208, height: 90 }, position: { x: 9, y: 9 } };
    const [next] = toFlowNodes([measured], [docNode("a", 40)], [], new Set());
    expect(next?.measured).toEqual({ width: 208, height: 90 });
    expect(next?.position).toEqual({ x: 40, y: 0 });
  });

  it("drops nodes that left the document", () => {
    const previous = toFlowNodes([], [docNode("a"), docNode("b")], [], new Set());
    expect(toFlowNodes(previous, [docNode("b")], [], new Set()).map((n) => n.id)).toEqual(["b"]);
  });
});

describe("toFlowEdges", () => {
  it("maps edges with selection", () => {
    expect(toFlowEdges([{ id: "e", source: "a", target: "b" }], new Set(["e"]))).toEqual([
      { id: "e", source: "a", target: "b", type: "component", selected: true },
    ]);
  });
});

describe("applySelectChanges", () => {
  it("adds and removes ids from select changes", () => {
    const changes: NodeChange[] = [
      { type: "select", id: "a", selected: false },
      { type: "select", id: "c", selected: true },
      { type: "position", id: "b", position: { x: 1, y: 1 } },
    ];
    expect(applySelectChanges(["a", "b"], changes)).toEqual(["b", "c"]);
  });

  it("returns the same list when there are no select changes", () => {
    const current = ["a"];
    expect(applySelectChanges(current, [{ type: "remove", id: "x" }])).toBe(current);
  });
});

describe("positionMoves", () => {
  it("collects positions from position changes only", () => {
    const changes: NodeChange[] = [
      { type: "position", id: "a", position: { x: 8, y: 16 }, dragging: true },
      { type: "position", id: "b", dragging: false },
      { type: "select", id: "a", selected: true },
    ];
    expect(positionMoves(changes)).toEqual([{ id: "a", position: { x: 8, y: 16 } }]);
  });

  it("puts sticky notes on the canvas too, under the components", () => {
    const notes = [{ id: "note", text: "Hello", position: { x: 5, y: 6 } }];
    const flow = toFlowNodes([], [docNode("a")], [], new Set(["note"]), notes);
    expect(flow.map((n) => [n.id, n.type])).toEqual([
      ["note", "note"],
      ["a", "component"],
    ]);
    expect(flow[0]).toMatchObject({
      position: { x: 5, y: 6 },
      data: { text: "Hello" },
      selected: true,
    });
    // Unchanged text keeps the same data object.
    expect(toFlowNodes(flow, [docNode("a")], [], new Set(), notes)[0]?.data).toBe(flow[0]?.data);
  });
});
