import { RESOLVER_GROUPS } from "../components/client/resolver.ts";
import { averageShapeFactor, type ShapeSettings } from "../components/client/shape.ts";
import { ROUTE_FOR_TYPE } from "../engine/compile.ts";
import { edgeKey, type MetricsSnapshot } from "../engine/metrics/recorder.ts";
import type { SystemDocument } from "../model/document.ts";

/*
 * How much each component is used, for the cost estimate (S44). While a run
 * is going, it's what the run measures. Otherwise it's worked out from the
 * clients' rates, following requests through the connections the way the
 * engine sends them. That's a rough pass: it ignores failures, retries and
 * caches answering reads (every read is counted at the store too), which
 * only changes the usage of components priced by size, not by request.
 */

/** Real requests per second, by kind. */
type Flow = { read: number; write: number; search: number };

/** One component's use, per second. */
export type Usage = {
  /** Requests arriving (lookups, for a DNS). */
  requests: number;
  /** Of those, the share that are writes: object storage prices them apart. */
  writeShare: number;
  /** Pub/sub: messages delivered, a copy per subscriber. */
  deliveries: number;
  /** Requests arriving straight from clients: their answers go out to the internet. */
  fromUsers: number;
};

const NONE: Flow = { read: 0, write: 0, search: 0 };
const total = (f: Flow) => f.read + f.write + f.search;
const scale = (f: Flow, by: number): Flow => ({
  read: f.read * by,
  write: f.write * by,
  search: f.search * by,
});

/** Usage worked out from the clients' rates, for every component in the document. */
export function estimateUsage(doc: SystemDocument): Map<string, Usage> {
  const types = new Map(doc.nodes.map((n) => [n.id, n.type]));
  const params = new Map(doc.nodes.map((n) => [n.id, n.params]));
  const targets = new Map<string, string[]>(doc.nodes.map((n) => [n.id, []]));
  const incoming = new Map<string, number>(doc.nodes.map((n) => [n.id, 0]));
  for (const edge of doc.edges) {
    if (!types.has(edge.source) || !types.has(edge.target)) continue;
    targets.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const inflow = new Map<string, Flow>();
  const lookups = new Map<string, number>();
  const fromUsers = new Map<string, number>();
  const deliveries = new Map<string, number>();
  const add = (id: string, flow: Flow) => {
    const now = inflow.get(id) ?? NONE;
    inflow.set(id, {
      read: now.read + flow.read,
      write: now.write + flow.write,
      search: now.search + flow.search,
    });
  };
  /** Requests taking turns between `ids`. */
  const split = (ids: readonly string[], flow: Flow) => {
    for (const id of ids) add(id, scale(flow, 1 / ids.length));
  };
  const num = (id: string, key: string, fallback = 0) => Number(params.get(id)?.[key] ?? fallback);

  const visit = (id: string) => {
    const type = types.get(id);
    const out = targets.get(id) ?? [];
    const routed = (route: string) =>
      out.filter((t) => ROUTE_FOR_TYPE[types.get(t) ?? ""] === route);
    const flow = inflow.get(id) ?? NONE;
    switch (type) {
      case "client": {
        const p = params.get(id) ?? {};
        const rate = num(id, "rate") * averageShapeFactor(p as unknown as ShapeSettings);
        const searches = num(id, "searchShare") / 100;
        const reads = (1 - searches) * (num(id, "readShare", 100) / 100);
        const sent = {
          read: rate * reads,
          write: rate * (1 - searches - reads),
          search: rate * searches,
        };
        const forward = routed("forward");
        split(forward, sent);
        for (const t of forward) fromUsers.set(t, (fromUsers.get(t) ?? 0) + rate / forward.length);
        // Each group of users looks up again once its answer expires (client/resolver.ts).
        const dns = routed("dns");
        for (const t of dns) {
          const perSecond = RESOLVER_GROUPS / Math.max(1, num(t, "ttl", 60));
          lookups.set(t, (lookups.get(t) ?? 0) + perSecond / dns.length);
        }
        return;
      }
      case "load-balancer":
      case "circuit-breaker":
        split(out, flow);
        return;
      case "api-gateway":
      case "rate-limiter": {
        // A limit on everyone together caps what gets through.
        const limited =
          type === "rate-limiter"
            ? params.get(id)?.scope !== "key" && num(id, "limit") > 0
            : params.get(id)?.rateLimiting === true;
        const limit = num(id, type === "rate-limiter" ? "limit" : "rateLimit");
        const passed = limited && total(flow) > limit ? scale(flow, limit / total(flow)) : flow;
        split(out, passed);
        return;
      }
      case "cdn":
        split(out, { ...flow, read: flow.read * (1 - num(id, "hitRatio") / 100) });
        return;
      case "service":
      case "worker": {
        // Calls to everything it forwards to, then its data (engine/runtime/dataAccess.ts).
        for (const t of routed("forward")) add(t, flow);
        split(routed("caches"), { ...NONE, read: flow.read });
        const replicas = routed("replicas");
        const databases = routed("databases");
        split(replicas.length > 0 ? replicas : databases, { ...NONE, read: flow.read });
        const search = routed("search");
        split(search.length > 0 ? search : databases, { ...NONE, search: flow.search });
        const queues = routed("queues");
        split(queues.length > 0 ? queues : databases, { ...NONE, write: flow.write });
        for (const t of routed("topics")) add(t, { ...NONE, write: flow.write });
        return;
      }
      case "queue":
        split(out, flow);
        return;
      case "pubsub":
        // Every subscriber gets a copy of everything.
        for (const t of out) add(t, flow);
        deliveries.set(id, total(flow) * out.length);
        return;
      case "database":
      case "sharded-database":
        // Writes are copied to replicas and indexed in search indexes.
        for (const t of out) add(t, { ...NONE, write: flow.write });
        return;
    }
  };

  // In connection order: a component once everything sending to it has been worked out.
  const ready = doc.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (ready.length > 0) {
    const id = ready.shift() as string;
    visit(id);
    for (const t of targets.get(id) ?? []) {
      const left = (incoming.get(t) ?? 0) - 1;
      incoming.set(t, left);
      if (left === 0) ready.push(t);
    }
  }
  // Components in a loop are never ready; they're left at what reached them.

  const usage = new Map<string, Usage>();
  for (const node of doc.nodes) {
    const flow = inflow.get(node.id) ?? NONE;
    const requests = node.type === "dns" ? (lookups.get(node.id) ?? 0) : total(flow);
    usage.set(node.id, {
      requests,
      writeShare: total(flow) > 0 ? flow.write / total(flow) : 0,
      deliveries: deliveries.get(node.id) ?? 0,
      fromUsers: fromUsers.get(node.id) ?? 0,
    });
  }
  return usage;
}

/**
 * Usage from a run: what each component measures right now. The mix of
 * reads and writes isn't measured, so it comes from the estimate.
 */
export function liveUsage(
  doc: SystemDocument,
  snapshot: MetricsSnapshot,
  estimate: ReadonlyMap<string, Usage>,
): Map<string, Usage> {
  const clients = doc.nodes.filter((n) => n.type === "client").map((n) => n.id);
  const usage = new Map<string, Usage>();
  for (const node of doc.nodes) {
    const m = snapshot.nodes[node.id];
    const fromUsers = clients.reduce(
      (sum, client) => sum + (snapshot.edges[edgeKey(client, node.id)]?.rate ?? 0),
      0,
    );
    usage.set(node.id, {
      requests: m?.arrivals ?? 0,
      writeShare: estimate.get(node.id)?.writeShare ?? 0,
      deliveries: node.type === "pubsub" ? (m?.throughput ?? 0) : 0,
      fromUsers,
    });
  }
  return usage;
}
