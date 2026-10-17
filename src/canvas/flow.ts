import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import type { SystemEdge, SystemNode } from "../model/document.ts";

/*
 * Translation between the design/selection stores and React Flow's node and
 * edge objects. The stores are the source of truth; React Flow only keeps
 * what it measures (node sizes) between renders.
 */

export type ComponentNodeData = { name: string; type: string };
export type ComponentFlowNode = Node<ComponentNodeData, "component">;
export type ComponentFlowEdge = Edge<Record<string, never>, "component">;

/**
 * Build React Flow nodes from the document, reusing what React Flow measured
 * on the previous nodes so it doesn't have to measure again.
 */
export function toFlowNodes(
  previous: readonly ComponentFlowNode[],
  nodes: readonly SystemNode[],
  selected: ReadonlySet<string>,
): ComponentFlowNode[] {
  const byId = new Map(previous.map((n) => [n.id, n]));
  return nodes.map((node) => {
    const prior = byId.get(node.id);
    return {
      ...prior,
      id: node.id,
      type: "component",
      position: node.position,
      data: { name: node.name, type: node.type },
      selected: selected.has(node.id),
    };
  });
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
