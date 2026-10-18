import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { defaultParams } from "../model/component.ts";
import type { SystemDocument, SystemNode } from "../model/document.ts";
import type { Registry } from "../model/registry.ts";
import { formatCompact } from "../simulation/format.ts";
import { formatData } from "./format.ts";
import { PRICES, SECONDS_PER_MONTH, SIZING } from "./prices.ts";
import { estimateUsage, liveUsage, type Usage } from "./usage.ts";

/*
 * The estimated monthly cost of a system (S44): each component's size from
 * its settings, plus its usage, at the prices in prices.ts. Clients are the
 * users, so they cost nothing; neither does a circuit breaker, which is
 * code inside your services.
 */

/** One part of a component's cost, and what drives it: "2 vCPUs, for 16 requests at once". */
export type CostLine = { label: string; monthly: number };

export type ComponentCost = { monthly: number; lines: CostLine[] };

export type SystemCost = {
  /** Dollars a month. */
  total: number;
  /** Every component with a cost of its own, biggest first. */
  components: { id: string; name: string; cost: ComponentCost }[];
  /** Usage measured by a run, rather than worked out from the clients' rates. */
  live: boolean;
};

/** Machines come in sizes that double: 1, 2, 4, 8… */
export const machineSize = (needed: number) => 2 ** Math.max(0, Math.ceil(Math.log2(needed)));

/** "1 vCPU", "2 vCPUs"; "1 job", "4 jobs". */
const plural = (n: number, word: string) => `${formatCompact(n)} ${word}${n === 1 ? "" : "s"}`;
const vcpus = (n: number) => plural(n, "vCPU");
const perMonth = (perSecond: number) => perSecond * SECONDS_PER_MONTH;
const millions = (perSecond: number) => perMonth(perSecond) / 1e6;
/** GB a month, from requests per second of `kb` each. */
const gbPerMonth = (perSecond: number, kb: number) => (perMonth(perSecond) * kb) / 1e6;
/** "263M requests a month", "26.3M messages published a month". */
const requests = (perSecond: number, what = "requests") => {
  const [noun, ...rest] = what.split(" ");
  return [formatCompact(perMonth(perSecond)), noun, ...rest, "a month"].join(" ");
};

const line = (label: string, monthly: number): CostLine => ({ label, monthly });

/** What the system's components need to know about the rest of it. */
export type CostContext = {
  /** The most distinct keys any client asks for: rows in a database, files in storage. */
  keys: number;
  /** Response size (KB) of a CDN's origin: its files, if it serves object storage. */
  cdnResponseKb: (id: string) => number;
};

/** Answers to users leave through the components clients connect to. */
function egress(usage: Usage): CostLine[] {
  if (usage.fromUsers <= 0) return [];
  const gb = gbPerMonth(usage.fromUsers, SIZING.responseKb);
  return [line(`${formatData(gb)} of answers to users`, gb * PRICES.egressPerGb)];
}

/** A database-like machine: vCPUs for its connections, at a price per vCPU. */
function databaseLines(connections: number, keys: number, copies = 1): CostLine[] {
  const size = machineSize(connections / SIZING.connectionsPerVcpu);
  const storage = Math.max(PRICES.databaseMinStorageGb, (keys / copies) * (SIZING.itemKb / 1e6));
  const each = copies > 1 ? " each" : "";
  const machines = copies > 1 ? `${copies} × ` : "";
  return [
    line(
      `${machines}${vcpus(size)}, for ${plural(connections, "connection")}${each}`,
      copies * size * PRICES.databaseVcpuMonth,
    ),
    line(
      `${machines}${formatData(storage)} of storage`,
      copies * storage * PRICES.databaseStorageGbMonth,
    ),
  ];
}

/** Lines for one component, or null for clients (the users, not part of the bill). */
function costLines(node: SystemNode, usage: Usage, context: CostContext): CostLine[] | null {
  const p = node.params;
  const num = (key: string) => Number(p[key] ?? 0);
  switch (node.type) {
    case "client":
      return null;
    case "service": {
      const size = machineSize(num("concurrency") / SIZING.serviceRequestsPerVcpu);
      return [
        line(
          `${vcpus(size)}, for ${plural(num("concurrency"), "request")} at once`,
          size * PRICES.computeVcpuMonth,
        ),
        ...egress(usage),
      ];
    }
    case "worker": {
      const size = machineSize(num("concurrency") / SIZING.workerJobsPerVcpu);
      return [
        line(
          `${vcpus(size)}, for ${plural(num("concurrency"), "job")} at once`,
          size * PRICES.computeVcpuMonth,
        ),
        ...egress(usage),
      ];
    }
    case "load-balancer": {
      const gb = gbPerMonth(usage.requests, SIZING.responseKb);
      return [
        line("The load balancer itself", PRICES.loadBalancerMonth),
        line(`${formatData(gb)} processed`, gb * PRICES.loadBalancerPerGb),
        ...egress(usage),
      ];
    }
    case "api-gateway":
      return [
        line(requests(usage.requests), millions(usage.requests) * PRICES.gatewayPerMillion),
        ...egress(usage),
      ];
    case "rate-limiter":
      return [
        line("The rate-limiting rule", PRICES.rateLimitRuleMonth),
        line(
          requests(usage.requests, "requests inspected"),
          millions(usage.requests) * PRICES.rateLimitPerMillion,
        ),
        ...egress(usage),
      ];
    case "circuit-breaker":
      return [line("Runs inside your services, so it costs nothing of its own", 0)];
    case "cdn": {
      const gb = gbPerMonth(usage.requests, context.cdnResponseKb(node.id));
      return [
        line(requests(usage.requests), millions(usage.requests) * PRICES.cdnPerMillion),
        line(`${formatData(gb)} delivered to users`, gb * PRICES.cdnPerGb),
      ];
    }
    case "dns":
      return [
        line("The hosted zone", PRICES.dnsZoneMonth),
        line(requests(usage.requests, "lookups"), millions(usage.requests) * PRICES.dnsPerMillion),
      ];
    case "database":
    case "read-replica":
      return databaseLines(num("connections"), context.keys);
    case "sharded-database":
      return databaseLines(num("connections"), context.keys, Math.max(1, num("shards")));
    case "search-index": {
      const size = machineSize(num("connections") / SIZING.searchConnectionsPerVcpu);
      return [
        line(
          `${vcpus(size)}, for ${plural(num("connections"), "connection")}`,
          size * PRICES.searchVcpuMonth,
        ),
      ];
    }
    case "cache": {
      const gb = machineSize((num("size") * SIZING.itemKb) / 1e6);
      return [
        line(
          `${formatData(gb)} of memory, for ${formatCompact(num("size"))} keys`,
          gb * PRICES.cacheGbMonth,
        ),
      ];
    }
    case "object-storage": {
      // Files go to a CDN or a service, not straight to users, so there's no internet transfer here.
      const gb = (context.keys * num("objectSize")) / 1e6;
      const reads = usage.requests * (1 - usage.writeShare);
      const writes = usage.requests * usage.writeShare;
      return [
        line(
          `${formatData(gb)} stored, ${formatCompact(context.keys)} files`,
          gb * PRICES.objectStorageGbMonth,
        ),
        line(requests(reads, "reads"), millions(reads) * PRICES.objectGetPerMillion),
        line(requests(writes, "writes"), millions(writes) * PRICES.objectPutPerMillion),
      ];
    }
    case "queue":
      return [
        line(
          requests(usage.requests, "jobs"),
          millions(usage.requests) * PRICES.queuePerMillionJobs,
        ),
      ];
    case "pubsub":
      return [
        line(
          requests(usage.requests, "messages published"),
          millions(usage.requests) * PRICES.pubsubPublishPerMillion,
        ),
        line(
          requests(usage.deliveries, "copies delivered"),
          millions(usage.deliveries) * PRICES.pubsubDeliverPerMillion,
        ),
      ];
    default:
      return null; // an unknown component: nothing to price
  }
}

export function componentCost(
  node: SystemNode,
  usage: Usage,
  context: CostContext,
): ComponentCost | null {
  const lines = costLines(node, usage, context);
  if (!lines) return null;
  return { monthly: lines.reduce((sum, l) => sum + l.monthly, 0), lines };
}

/** A run has measured rates once it has run this long (simulated ms). */
export const LIVE_AFTER_MS = 1000;

/**
 * The system's estimated monthly cost. With a snapshot (a run going), usage
 * is what the run measures; otherwise, or before the run has measured
 * anything, it's worked out from the clients' rates.
 */
export function systemCost(
  doc: SystemDocument,
  registry: Registry,
  snapshot: MetricsSnapshot | null = null,
): SystemCost {
  // Params as the engine sees them: defaults filled in.
  const filled: SystemDocument = {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const definition = registry.get(node.type);
      return definition
        ? { ...node, params: { ...defaultParams(definition), ...node.params } }
        : node;
    }),
  };
  const estimate = estimateUsage(filled);
  const measured = snapshot && snapshot.time >= LIVE_AFTER_MS ? snapshot : null;
  const usage = measured ? liveUsage(filled, measured, estimate) : estimate;
  const byId = new Map(filled.nodes.map((n) => [n.id, n]));
  const context: CostContext = {
    keys: Math.max(
      0,
      ...filled.nodes.filter((n) => n.type === "client").map((n) => Number(n.params.keys ?? 0)),
    ),
    cdnResponseKb: (id) => {
      const storage = filled.edges
        .filter((e) => e.source === id)
        .map((e) => byId.get(e.target))
        .find((n) => n?.type === "object-storage");
      return storage ? Number(storage.params.objectSize ?? SIZING.responseKb) : SIZING.responseKb;
    },
  };
  const none: Usage = { requests: 0, writeShare: 0, deliveries: 0, fromUsers: 0 };
  const components: SystemCost["components"] = [];
  for (const node of filled.nodes) {
    const cost = componentCost(node, usage.get(node.id) ?? none, context);
    if (cost) components.push({ id: node.id, name: node.name, cost });
  }
  components.sort((a, b) => b.cost.monthly - a.cost.monthly);
  return {
    total: components.reduce((sum, c) => sum + c.cost.monthly, 0),
    components,
    live: measured !== null,
  };
}
