import type { Category, ComponentDefinition, Params } from "../model/component.ts";
import { canConnect, defaultParams, paramsSchema } from "../model/component.ts";
import type { SystemDocument } from "../model/document.ts";
import type { Registry } from "../model/registry.ts";

/*
 * Turns a system document into what the engine runs: each component with
 * validated params and its connections sorted by what they lead to.
 * Problems come back in plain words, using the user's component names.
 * Errors stop a run; warnings don't, but explain what will sit idle or fail.
 */

/** Where a component's outgoing connections go, by kind. In document order. */
export type Routes = {
  /** Services, load balancers, gateways and CDNs: pass the request on. */
  forward: string[];
  caches: string[];
  databases: string[];
  replicas: string[];
  queues: string[];
  workers: string[];
};

export type RuntimeNode = {
  id: string;
  type: string;
  name: string;
  category: Category;
  definition: ComponentDefinition;
  /** Complete and valid: missing or invalid values replaced by defaults. */
  params: Params;
  /** Outgoing connections, in document order. */
  targets: string[];
  /** Incoming connections, in document order. */
  sources: string[];
  routes: Routes;
};

/** A chaos timeline event (S40), resolved to the components it acts on. Times in ms. */
export type RuntimeEvent =
  | { kind: "down"; at: number; node: string; until: number | null }
  | { kind: "slow"; at: number; node: string; factor: number; until: number }
  | { kind: "cut"; at: number; from: string; to: string; until: number }
  | { kind: "flush"; at: number; node: string }
  | { kind: "surge"; at: number; factor: number; until: number };

export type RuntimeModel = {
  nodes: ReadonlyMap<string, RuntimeNode>;
  /** Node ids in document order: the order the engine sets things up in. */
  order: readonly string[];
  clients: readonly string[];
  /** The chaos timeline, in time order. */
  events: readonly RuntimeEvent[];
};

export type CompileIssue = {
  severity: "error" | "warning";
  message: string;
  /** The component (or connection) it's about, for highlighting. */
  nodeId?: string;
  edgeId?: string;
};

export type CompileResult = {
  /** Null when there are errors. */
  model: RuntimeModel | null;
  errors: CompileIssue[];
  warnings: CompileIssue[];
};

const ROUTE_FOR_TYPE: Record<string, keyof Routes> = {
  service: "forward",
  "load-balancer": "forward",
  "api-gateway": "forward",
  cdn: "forward",
  cache: "caches",
  database: "databases",
  "read-replica": "replicas",
  queue: "queues",
  worker: "workers",
};

const emptyRoutes = (): Routes => ({
  forward: [],
  caches: [],
  databases: [],
  replicas: [],
  queues: [],
  workers: [],
});

/** Params with defaults filled in; any invalid value is replaced by its default. */
function resolveParams(definition: ComponentDefinition, raw: Record<string, unknown>) {
  const schema = paramsSchema(definition);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { params: parsed.data as Params, invalid: [] as string[] };

  const defaults = defaultParams(definition);
  const invalid = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
  const repaired = { ...raw };
  for (const key of invalid) repaired[key] = defaults[key];
  return { params: schema.parse(repaired) as Params, invalid };
}

/** The first cycle found, as node ids (first id repeated at the end), or null. */
function findCycle(order: readonly string[], targets: (id: string) => readonly string[]) {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of targets(id)) {
      if (state.get(next) === "visiting") return [...stack.slice(stack.indexOf(next)), next];
      if (!state.has(next)) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const id of order) {
    if (!state.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function compile(doc: SystemDocument, registry: Registry): CompileResult {
  const errors: CompileIssue[] = [];
  const warnings: CompileIssue[] = [];
  const error = (message: string, ids: { nodeId?: string; edgeId?: string } = {}) =>
    errors.push({ severity: "error", message, ...ids });
  const warn = (message: string, ids: { nodeId?: string; edgeId?: string } = {}) =>
    warnings.push({ severity: "warning", message, ...ids });

  // Components.
  const nodes = new Map<string, RuntimeNode>();
  for (const node of doc.nodes) {
    const definition = registry.get(node.type);
    if (!definition) {
      error(`${node.name} is an unknown kind of component (“${node.type}”).`, { nodeId: node.id });
      continue;
    }
    const { params, invalid } = resolveParams(definition, node.params);
    for (const key of invalid) {
      const spec = definition.params[key];
      if (spec) {
        warn(`${node.name}: “${spec.label}” had an invalid value, so the default is used.`, {
          nodeId: node.id,
        });
      }
    }
    nodes.set(node.id, {
      id: node.id,
      type: node.type,
      name: node.name,
      category: definition.category,
      definition,
      params,
      targets: [],
      sources: [],
      routes: emptyRoutes(),
    });
  }

  // Connections.
  for (const edge of doc.edges) {
    const from = nodes.get(edge.source);
    const to = nodes.get(edge.target);
    if (!from || !to) continue; // an unknown component, already reported
    const check = canConnect(from.definition, to.definition);
    if (!check.ok) {
      error(`${from.name} → ${to.name} isn't allowed: ${check.reason}`, { edgeId: edge.id });
      continue;
    }
    from.targets.push(to.id);
    to.sources.push(from.id);
    const route = ROUTE_FOR_TYPE[to.type];
    if (route) from.routes[route].push(to.id);
  }

  const order = doc.nodes.map((n) => n.id).filter((id) => nodes.has(id));
  const clients = order.filter((id) => nodes.get(id)?.type === "client");

  if (clients.length === 0) {
    error(
      doc.nodes.length === 0
        ? "Add a Client to send traffic."
        : "Add a Client to send traffic into the system.",
    );
  }

  // Pass-through components that can't pass anything on.
  for (const node of nodes.values()) {
    if (!node.definition.connections.outgoingRequired || node.targets.length > 0) continue;
    if (node.type === "queue") {
      warn(`No worker takes jobs from ${node.name}, so jobs will pile up.`, { nodeId: node.id });
    } else if (node.type === "client") {
      error(`${node.name} isn't connected to anything, so its requests have nowhere to go.`, {
        nodeId: node.id,
      });
    } else {
      error(`${node.name} has nothing to send requests to.`, { nodeId: node.id });
    }
  }

  // Loops would send a request round forever.
  const cycle = findCycle(order, (id) => nodes.get(id)?.targets ?? []);
  if (cycle) {
    const names = cycle.map((id) => nodes.get(id)?.name ?? id).join(" → ");
    error(`Requests could go round in a loop forever: ${names}.`, { nodeId: cycle[0] as string });
  }

  // Components that will sit idle or misbehave, but don't stop a run.
  const reachable = new Set<string>();
  const frontier = [...clients];
  while (frontier.length > 0) {
    const id = frontier.shift() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    frontier.push(...(nodes.get(id)?.targets ?? []));
  }
  for (const node of nodes.values()) {
    if (node.type !== "client" && !reachable.has(node.id) && clients.length > 0) {
      warn(`Nothing sends requests to ${node.name}, so it will sit idle.`, { nodeId: node.id });
    }
    if (
      node.type === "read-replica" &&
      !node.sources.some((id) => nodes.get(id)?.type === "database")
    ) {
      warn(`${node.name} isn't fed by a database, so it never sees new writes.`, {
        nodeId: node.id,
      });
    }
    const { caches, databases, replicas } = node.routes;
    if (
      (node.type === "service" || node.type === "worker") &&
      caches.length > 0 &&
      databases.length + replicas.length === 0
    ) {
      warn(`Cache misses at ${node.name} have nowhere to go. Connect it to a database.`, {
        nodeId: node.id,
      });
    }
    if (
      (node.type === "service" || node.type === "worker") &&
      replicas.length > 0 &&
      databases.length === 0
    ) {
      warn(
        `${node.name} reads from replicas but has no database to write to, so writes will fail.`,
        {
          nodeId: node.id,
        },
      );
    }
  }

  const events = resolveEvents(doc, nodes, warn);

  return {
    model: errors.length === 0 ? { nodes, order, clients, events } : null,
    errors,
    warnings,
  };
}

/** Resolve the timeline, leaving out (with a warning) events that no longer fit. */
function resolveEvents(
  doc: SystemDocument,
  nodes: ReadonlyMap<string, RuntimeNode>,
  warn: (message: string, ids: { nodeId?: string; edgeId?: string }) => void,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const event of doc.scenario?.events ?? []) {
    const end = (duration: number) => event.at + duration;
    if (event.kind === "surge") {
      events.push({
        kind: "surge",
        at: event.at,
        factor: event.factor,
        until: end(event.duration),
      });
      continue;
    }
    if (event.kind === "cut") {
      const edge = doc.edges.find((e) => e.id === event.target);
      if (!edge) {
        warn("A timeline event cuts a connection that's gone; it's left out.", {});
        continue;
      }
      events.push({
        kind: "cut",
        at: event.at,
        from: edge.source,
        to: edge.target,
        until: end(event.duration),
      });
      continue;
    }
    const node = nodes.get(event.target);
    if (!node) {
      warn("A timeline event is about a component that's gone; it's left out.", {});
      continue;
    }
    if (event.kind === "flush" && node.type !== "cache") {
      warn(`Only caches can be flushed, so the flush of ${node.name} is left out.`, {
        nodeId: node.id,
      });
      continue;
    }
    if (event.kind === "slow" && node.type === "client") {
      warn(`${node.name} is a client: slow down a component instead.`, { nodeId: node.id });
      continue;
    }
    if (event.kind === "flush") events.push({ kind: "flush", at: event.at, node: node.id });
    else if (event.kind === "slow") {
      events.push({
        kind: "slow",
        at: event.at,
        node: node.id,
        factor: event.factor,
        until: end(event.duration),
      });
    } else {
      events.push({
        kind: "down",
        at: event.at,
        node: node.id,
        until: event.duration === null ? null : end(event.duration),
      });
    }
  }
  return events;
}
