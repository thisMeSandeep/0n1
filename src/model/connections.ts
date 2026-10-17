import { type ComponentDefinition, type ConnectionCheck, canConnect } from "./component.ts";
import type { SystemDocument, SystemEdge } from "./document.ts";
import type { Registry } from "./registry.ts";

/**
 * Whether `source` may connect to `target` in this document: the component
 * rules from S07 plus document-level ones (no self-loops, no duplicates).
 * The canvas uses this live while dragging; the design store uses it to
 * reject bad edits.
 */
export function checkConnection(
  doc: SystemDocument,
  registry: Registry,
  source: string,
  target: string,
): ConnectionCheck {
  const from = doc.nodes.find((n) => n.id === source);
  const to = doc.nodes.find((n) => n.id === target);
  if (!from || !to) return { ok: false, reason: "That component no longer exists." };
  if (source === target) return { ok: false, reason: "A component can't connect to itself." };
  if (doc.edges.some((e) => e.source === source && e.target === target)) {
    return { ok: false, reason: "These components are already connected." };
  }
  const fromDef = registry.get(from.type);
  const toDef = registry.get(to.type);
  if (!fromDef || !toDef) return { ok: false, reason: "Unknown component type." };
  return canConnect(fromDef, toDef);
}

/**
 * A short hint for a component that isn't wired up enough to do anything,
 * or null when it's fine (UIUX §6, "Not connected").
 */
export function connectionHint(
  definition: ComponentDefinition,
  incoming: number,
  outgoing: number,
): string | null {
  const { connections } = definition;
  if (incoming === 0 && outgoing === 0) {
    return connections.outgoing.length > 0
      ? "Not connected yet. Drag from its right edge to another component."
      : "Not connected yet. Connect something to it so it gets requests.";
  }
  if (connections.incoming && incoming === 0) {
    return "Nothing sends requests here yet, so it will sit idle.";
  }
  if (connections.outgoingRequired && outgoing === 0) {
    return "It has nowhere to send requests yet. Connect it to the next component.";
  }
  return null;
}

/** Incoming and outgoing connection counts per node id. */
export function edgeCounts(doc: { readonly edges: readonly SystemEdge[] }) {
  const counts = new Map<string, { incoming: number; outgoing: number }>();
  const get = (id: string) => {
    let entry = counts.get(id);
    if (!entry) {
      entry = { incoming: 0, outgoing: 0 };
      counts.set(id, entry);
    }
    return entry;
  };
  for (const edge of doc.edges) {
    get(edge.source).outgoing++;
    get(edge.target).incoming++;
  }
  return counts;
}
