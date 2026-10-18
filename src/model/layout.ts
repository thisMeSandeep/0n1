import type { SystemEdge, SystemNode } from "./document.ts";

/*
 * Where a system's components sit and how they connect, and nothing else:
 * enough to draw a thumbnail of it (M01). Small, so a whole library of them
 * is cheap to list.
 */

export type SystemLayout = {
  nodes: { id: string; type: string; x: number; y: number }[];
  edges: { source: string; target: string }[];
};

export const EMPTY_LAYOUT: SystemLayout = { nodes: [], edges: [] };

export function layoutOf({
  nodes,
  edges,
}: {
  nodes: readonly SystemNode[];
  edges: readonly SystemEdge[];
}): SystemLayout {
  return {
    nodes: nodes.map(({ id, type, position }) => ({ id, type, x: position.x, y: position.y })),
    edges: edges.map(({ source, target }) => ({ source, target })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The layout of a document as it was stored, read leniently: listing the
 * library shouldn't migrate and validate every system. Anything it can't
 * read is left out. (Positions have kept their shape in every schema
 * version; a migration that changes them must change this too.)
 */
export function layoutOfStored(raw: unknown): SystemLayout {
  if (!isRecord(raw) || !Array.isArray(raw.nodes)) return EMPTY_LAYOUT;
  const nodes: SystemLayout["nodes"] = [];
  for (const node of raw.nodes) {
    if (!isRecord(node) || !isRecord(node.position)) continue;
    const { id, type } = node;
    const { x, y } = node.position;
    if (
      typeof id === "string" &&
      typeof type === "string" &&
      typeof x === "number" &&
      typeof y === "number"
    ) {
      nodes.push({ id, type, x, y });
    }
  }
  const edges: SystemLayout["edges"] = [];
  for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (isRecord(edge) && typeof edge.source === "string" && typeof edge.target === "string") {
      edges.push({ source: edge.source, target: edge.target });
    }
  }
  return { nodes, edges };
}
