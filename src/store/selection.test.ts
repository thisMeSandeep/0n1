import { describe, expect, it } from "vitest";
import { createSystemDocument } from "../model/document.ts";
import { createSelectionStore } from "./selection.ts";

describe("selection store", () => {
  it("replaces, adds to and toggles the selection", () => {
    const store = createSelectionStore();
    const { select } = store.getState();

    select({ nodeIds: ["a"] });
    expect(store.getState().nodeIds).toEqual(["a"]);

    select({ nodeIds: ["b"], edgeIds: ["e1"] }, "add");
    expect(store.getState()).toMatchObject({ nodeIds: ["a", "b"], edgeIds: ["e1"] });

    select({ nodeIds: ["a", "c"] }, "toggle");
    expect(store.getState().nodeIds).toEqual(["b", "c"]);

    select({ nodeIds: ["x", "x"] });
    expect(store.getState()).toMatchObject({ nodeIds: ["x"], edgeIds: [] });
  });

  it("clears", () => {
    const store = createSelectionStore();
    store.getState().select({ nodeIds: ["a"], edgeIds: ["e"] });
    store.getState().clear();
    expect(store.getState()).toMatchObject({ nodeIds: [], edgeIds: [] });
  });

  it("prunes ids that are no longer in the document", () => {
    const store = createSelectionStore();
    store.getState().select({ nodeIds: ["a", "gone"], edgeIds: ["e", "gone-edge"] });
    const doc = {
      ...createSystemDocument({ id: "s", now: 0 }),
      nodes: [{ id: "a", type: "cache", name: "Cache", position: { x: 0, y: 0 }, params: {} }],
      edges: [{ id: "e", source: "a", target: "a" }],
    };
    store.getState().prune(doc);
    expect(store.getState()).toMatchObject({ nodeIds: ["a"], edgeIds: ["e"] });
  });
});
