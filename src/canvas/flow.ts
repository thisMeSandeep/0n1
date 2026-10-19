import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { registry } from "../components/index.ts";
import { connectionHint, edgeCounts } from "../model/connections.ts";
import type { SystemEdge, SystemNode, SystemNote } from "../model/document.ts";
import type { NoteFlowNode } from "./NoteNode.tsx";

/*
 * Translation between the design/selection stores and React Flow's node and
 * edge objects. The stores are the source of truth; React Flow only keeps
 * what it measures (node sizes) between renders.
 */

export type ComponentNodeData = {
  name: string;
  type: string;
  /** Why this component isn't wired up enough to do anything, if it isn't. */
  hint: string | null;
  /** A vendor icon chosen for it, if any. */
  icon: string | null;
};
export type ComponentFlowNode = Node<ComponentNodeData, "component">;
export type ComponentFlowEdge = Edge<Record<string, never>, "component">;
/** Everything on the canvas: components and sticky notes (M04). */
export type CanvasFlowNode = ComponentFlowNode | NoteFlowNode;

/**
 * Build React Flow nodes from the document, reusing what React Flow measured
 * on the previous nodes so it doesn't have to measure again.
 */
export function toFlowNodes(
  previous: readonly CanvasFlowNode[],
  nodes: readonly SystemNode[],
  edges: readonly SystemEdge[],
  selected: ReadonlySet<string>,
  notes: readonly SystemNote[] = [],
): CanvasFlowNode[] {
  const byId = new Map(previous.map((n) => [n.id, n]));
  const counts = edgeCounts({ edges });
  // Notes first, so components sit on top where they overlap.
  const noteNodes = notes.map((note): NoteFlowNode => {
    const prior = byId.get(note.id);
    const data =
      prior?.type === "note" && prior.data.text === note.text ? prior.data : { text: note.text };
    return {
      ...(prior?.type === "note" ? prior : {}),
      id: note.id,
      type: "note",
      position: note.position,
      data,
      selected: selected.has(note.id),
    };
  });
  const componentNodes = nodes.map((node): ComponentFlowNode => {
    const found = byId.get(node.id);
    const prior = found?.type === "component" ? found : undefined;
    const definition = registry.get(node.type);
    const count = counts.get(node.id) ?? { incoming: 0, outgoing: 0 };
    const hint = definition ? connectionHint(definition, count.incoming, count.outgoing) : null;
    // Keep the same data object when nothing changed, so memoized nodes skip re-rendering.
    const data =
      prior &&
      prior.data.name === node.name &&
      prior.data.type === node.type &&
      prior.data.hint === hint &&
      prior.data.icon === (node.icon ?? null)
        ? prior.data
        : { name: node.name, type: node.type, hint, icon: node.icon ?? null };
    return {
      ...prior,
      id: node.id,
      type: "component",
      position: node.position,
      data,
      selected: selected.has(node.id),
    };
  });
  return [...noteNodes, ...componentNodes];
}

export function toFlowEdges(
  edges: readonly SystemEdge[],
  selected: ReadonlySet<string>,
): ComponentFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "component",
    selected: selected.has(edge.id),
  }));
}

/** Apply React Flow's select/deselect changes to a list of selected ids. */
export function applySelectChanges(
  current: readonly string[],
  changes: readonly (NodeChange | EdgeChange)[],
): readonly string[] {
  const selects = changes.filter((c) => c.type === "select");
  if (selects.length === 0) return current;
  const next = new Set(current);
  for (const change of selects) {
    if (change.selected) next.add(change.id);
    else next.delete(change.id);
  }
  return [...next];
}

/** Position updates from a drag or keyboard move, ready for the design store. */
export function positionMoves(changes: readonly NodeChange[]) {
  return changes.flatMap((change) =>
    change.type === "position" && change.position
      ? [{ id: change.id, position: change.position }]
      : [],
  );
}
