import { describe, expect, it } from "vitest";
import { designStore, selectionStore } from "./index.ts";

describe("app stores", () => {
  it("drop deleted components from the selection, including after undo", () => {
    const id = designStore.getState().addNode("cache", { x: 0, y: 0 });
    selectionStore.getState().select({ nodeIds: [id] });

    designStore.getState().removeNodes([id]);
    expect(selectionStore.getState().nodeIds).toEqual([]);

    designStore.temporal.getState().undo();
    selectionStore.getState().select({ nodeIds: [id] });
    designStore.temporal.getState().undo();
    expect(selectionStore.getState().nodeIds).toEqual([]);
  });
});
