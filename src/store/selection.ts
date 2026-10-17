import { createStore } from "zustand/vanilla";
import type { SystemDocument } from "../model/document.ts";

/**
 * What's selected on the canvas. Kept apart from the design store so
 * selecting never creates undo history.
 */

export type SelectMode = "replace" | "add" | "toggle";

export type SelectionState = {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  /** Only the lists given are changed; e.g. selecting nodes leaves edges as they are. */
  select(
    ids: { nodeIds?: readonly string[]; edgeIds?: readonly string[] },
    mode?: SelectMode,
  ): void;
  clear(): void;
  /** Drop ids that are no longer in the document (after delete or undo). */
  prune(doc: SystemDocument): void;
};

function combine(current: readonly string[], ids: readonly string[], mode: SelectMode): string[] {
  if (mode === "replace") return [...new Set(ids)];
  const next = new Set(current);
  for (const id of ids) {
    if (mode === "toggle" && next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function createSelectionStore() {
  return createStore<SelectionState>()((set, get) => ({
    nodeIds: [],
    edgeIds: [],

    select({ nodeIds, edgeIds }, mode = "replace") {
      const current = get();
      const nextNodes = nodeIds ? combine(current.nodeIds, nodeIds, mode) : current.nodeIds;
      const nextEdges = edgeIds ? combine(current.edgeIds, edgeIds, mode) : current.edgeIds;
      // Keep references stable when nothing changed, so subscribers don't re-render.
      if (sameIds(nextNodes, current.nodeIds) && sameIds(nextEdges, current.edgeIds)) return;
      set({ nodeIds: nextNodes, edgeIds: nextEdges });
    },

    clear() {
      if (get().nodeIds.length || get().edgeIds.length) set({ nodeIds: [], edgeIds: [] });
    },

    prune(doc) {
      const nodes = new Set(doc.nodes.map((n) => n.id));
      const edges = new Set(doc.edges.map((e) => e.id));
      const nodeIds = get().nodeIds.filter((id) => nodes.has(id));
      const edgeIds = get().edgeIds.filter((id) => edges.has(id));
      if (!sameIds(nodeIds, get().nodeIds) || !sameIds(edgeIds, get().edgeIds)) {
        set({ nodeIds, edgeIds });
      }
    },
  }));
}

export type SelectionStore = ReturnType<typeof createSelectionStore>;
