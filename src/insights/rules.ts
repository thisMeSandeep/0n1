import { edgeKey, type MetricsSnapshot, type NodeMetrics } from "../engine/metrics/recorder.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { SystemDocument, SystemNode } from "../model/document.ts";
import {
  formatCompact,
  formatDuration,
  formatPercent,
  type Measure,
} from "../simulation/format.ts";
import { whereTimeWent } from "../tracing/waterfall.ts";

/*
 * Bottleneck explanations (S41): rules over a live snapshot that say what's
 * wrong in plain English, where, and what might help. Plain code, so it's
 * deterministic and testable. When nothing matches, it says nothing rather
 * than guess.
 */

export type InsightSeverity = "warn" | "fail";

export type Insight = {
  /** Stable while the situation lasts, e.g. "overloaded:db". */
  id: string;
  severity: InsightSeverity;
  /** The component it's about, for selecting it. */
  nodeId?: string;
  /** The short part, e.g. "Links DB has no free connections." */
  title: string;
  /** The numbers: "240 requests are waiting, about 310 ms each." */
  detail: string;
  /** A hint at what might help, in the palette's words. */
  fix?: string;
};

/** Above this utilization a server is overloaded (as on the canvas, live.ts). */
export const OVERLOADED = 0.9;
/** From this utilization it's close to its limit. */
export const NEAR_LIMIT = 0.85;
/** From this share of failed or turned-away requests, it's worth saying. */
export const FAILING = 0.05;
/** Below this hit ratio a cache isn't pulling its weight… */
export const LOW_HIT_RATIO = 0.3;
/** …once it has had time to warm up (simulated ms). */
export const CACHE_WARMUP_MS = 15_000;
/** From this share of stale reads, a replica gets a note. */
export const STALE = 0.05;
/** A queue backlog worth a note. */
export const BACKLOG = 100;

const show = (m: Measure) => `${m.value}${m.unit === "%" ? "%" : ` ${m.unit}`}`;
const percent = (share: number) => show(formatPercent(share));
const duration = (ms: number) => show(formatDuration(ms));
const count = (n: number) => formatCompact(n);

/** What a full component is out of, and what helps, by type. */
const CAPACITY: Readonly<Record<string, { full: string; fix: string }>> = {
  database: {
    full: "has no free connections",
    fix: "Add a cache, a read replica, or more connections.",
  },
  "read-replica": {
    full: "has no free connections",
    fix: "Add another replica, or give it more connections.",
  },
  service: {
    full: "can't take on any more requests",
    fix: "Add another service behind a load balancer, or raise Requests at once.",
  },
  worker: {
    full: "is busy with every job it can take",
    fix: "Add a worker, or raise Jobs at once.",
  },
  cache: { full: "is answering as fast as it can", fix: "Raise its Requests at once." },
  "load-balancer": { full: "is at its throughput limit", fix: "Raise its Throughput limit." },
  "api-gateway": { full: "is at its throughput limit", fix: "Raise its Throughput limit." },
  "sharded-database": {
    full: "has a shard with no free connections",
    fix: "Add shards, give each more connections, or put a cache in front of it.",
  },
  "search-index": { full: "has no free connections", fix: "Give it more connections." },
  "object-storage": {
    full: "can't take on any more requests",
    fix: "Put a CDN in front of it for the files people fetch most.",
  },
};

/** Whether any client sends searches (S43b). */
function anySearches(doc: SystemDocument): boolean {
  return doc.nodes.some((n) => n.type === "client" && Number(n.params.searchShare ?? 0) > 0);
}

/** "Shard 1 of 4 is 98% busy; the others average 20%." */
function hotShardNote(hot: { index: number; busy: number; others: number }, count: number): string {
  return `Shard ${hot.index + 1} of ${count} is ${percent(hot.busy)} busy; the others average ${percent(hot.others)}.`;
}

/** What helps a hot shard depends on how keys are spread. */
function hotShardFix(spread: unknown): string {
  return spread === "range"
    ? "Spread keys by hash, so the popular keys aren't all on one shard."
    : "A few very popular keys live on that shard. Put a cache in front of it.";
}

/** A sharded database's busiest shard, if it's much busier than the rest (S43b). */
function hotShard(m: NodeMetrics): { index: number; busy: number; others: number } | null {
  const shards = m.shards;
  if (!shards || shards.length < 2) return null;
  let index = 0;
  shards.forEach((u, i) => {
    if (u > (shards[index] ?? 0)) index = i;
  });
  const busy = shards[index] ?? 0;
  const others = (shards.reduce((sum, u) => sum + u, 0) - busy) / (shards.length - 1);
  return busy > NEAR_LIMIT && others < busy * 0.6 ? { index, busy, others } : null;
}

/** Components a request from `id` goes on to. */
function downstream(doc: SystemDocument, id: string): string[] {
  return doc.edges.filter((e) => e.source === id).map((e) => e.target);
}

const overloaded = (m: NodeMetrics | undefined) =>
  m !== undefined && !m.down && m.utilization > OVERLOADED;

/** Share of requests that failed at this component itself (S30). */
const failedHere = (m: NodeMetrics) => (m.arrivals > 0 ? Math.min(1, m.failures / m.arrivals) : 0);

/** Little's law: time in line ≈ requests waiting ÷ rate they're served at. */
const waitMs = (m: NodeMetrics) => (m.throughput > 0 ? (m.waiting / m.throughput) * 1000 : null);

/** p99 users see from which "requests are slow" is worth a note (the vitals' amber, live.ts). */
export const SLOW_P99_MS = 500;
/** A slow trace this recent (simulated ms) still describes the system. */
export const TRACE_FRESH_MS = 15_000;
/** One component took at least this share of a slow request's time. */
export const TIME_SHARE = 0.5;

/** A pub/sub subscriber's backlog, as InsightContext.backlogGrowth knows it (S43c). */
export const backlogKey = (pubsub: string, subscriber: string) => `${pubsub}:${subscriber}`;

export type InsightContext = {
  /**
   * How fast each backlog grew lately (jobs per second), from InsightTracker:
   * queues by id, pub/sub subscribers by backlogKey.
   */
  backlogGrowth?: ReadonlyMap<string, number>;
  /** The run's slowest recent request (S42): where its time went. */
  slowTrace?: TraceRecord | null;
};

/** The insights for one snapshot, worst first. */
export function findInsights(
  snapshot: MetricsSnapshot,
  doc: SystemDocument,
  { backlogGrowth = new Map(), slowTrace = null }: InsightContext = {},
): Insight[] {
  const insights: Insight[] = [];
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const metricsOf = (id: string) => snapshot.nodes[id];
  const nameOf = (id: string) => nodes.get(id)?.name ?? id;
  const spent = timeSpent(snapshot, slowTrace);
  // Waiting at a component that's only full because what it calls is
  // overloaded: the time belongs to that, further down.
  let blamed = spent?.node;
  for (let hops = 0; blamed && hops < doc.nodes.length; hops++) {
    if (!overloaded(metricsOf(blamed))) break;
    const next = downstream(doc, blamed).find((id) => overloaded(metricsOf(id)));
    if (!next) break;
    blamed = next;
  }
  const spentText = spent
    ? spentSentence(
        spent,
        nameOf(spent.node),
        blamed && blamed !== spent.node ? nameOf(blamed) : null,
      )
    : "";
  const spentAt = (id: string) => (spent && blamed === id ? ` ${spentText}` : "");

  // Components down, and connections cut: the plainest causes.
  for (const node of doc.nodes) {
    if (!metricsOf(node.id)?.down) continue;
    if (node.type === "dns") {
      insights.push(dnsDown(node, doc, snapshot));
      continue;
    }
    insights.push({
      id: `down:${node.id}`,
      severity: "fail",
      nodeId: node.id,
      title: `${node.name} is down.`,
      detail: "Requests sent to it fail at once.",
      fix: "Bring it back (select it and press K), or add a second one behind a load balancer.",
    });
  }
  for (const edge of doc.edges) {
    if (!snapshot.faults.cut.includes(edgeKey(edge.source, edge.target))) continue;
    insights.push({
      id: `cut:${edge.id}`,
      severity: "fail",
      nodeId: edge.source,
      title: `${nameOf(edge.source)} → ${nameOf(edge.target)} is cut.`,
      detail: "Requests on it fail at once, until the timeline heals it.",
    });
  }

  // Backlogs (queues, pub/sub) have notes of their own below.
  const servers = doc.nodes.filter(
    (n) => n.type !== "client" && n.type !== "queue" && n.type !== "pubsub",
  );
  /** Overloaded components whose own downstream isn't: the real bottlenecks. */
  const bottlenecks: SystemNode[] = [];

  // Queues with a backlog: their workers being flat out is part of that story, told once.
  const backlogged = new Set(
    doc.nodes
      .filter((n) => n.type === "queue" && (metricsOf(n.id)?.waiting ?? 0) >= BACKLOG)
      .map((n) => n.id),
  );
  // Pub/sub subscribers with a backlog of their own (S43c), likewise.
  for (const topic of doc.nodes.filter((n) => n.type === "pubsub")) {
    for (const s of metricsOf(topic.id)?.subscriptions ?? []) {
      if (s.waiting >= BACKLOG) backlogged.add(backlogKey(topic.id, s.node));
    }
  }
  const feedsFromBacklog = (id: string) =>
    doc.edges.some(
      (e) =>
        e.target === id && (backlogged.has(e.source) || backlogged.has(backlogKey(e.source, id))),
    );

  for (const node of servers) {
    const m = metricsOf(node.id);
    if (!m || m.down) continue;
    const capacity = CAPACITY[node.type];
    const share = failedHere(m);

    // A breaker failing calls fast is protecting what's behind it (S43a).
    if (node.type === "circuit-breaker") {
      const behind = listNames(downstream(doc, node.id).map(nameOf)) || "its dependency";
      if (m.breakerState === "open") {
        insights.push({
          id: `breaker:${node.id}`,
          severity: "warn",
          nodeId: node.id,
          title: `${node.name} is open.`,
          detail: `It fails calls at once so ${behind} gets a break, and tries again after ${duration(Number(node.params.coolDown ?? 0) * 1000)}.`,
        });
      } else if (m.breakerState === "half-open") {
        insights.push({
          id: `breaker:${node.id}`,
          severity: "warn",
          nodeId: node.id,
          title: `${node.name} is testing ${behind}.`,
          detail: "It lets a few calls through to see whether it has recovered.",
        });
      }
      continue;
    }
    // A limiter turning traffic away is doing its job: say what's over the limit.
    if (node.type === "rate-limiter") {
      if (share >= FAILING) {
        const limit = `${count(Number(node.params.limit ?? 0))}/s`;
        insights.push({
          id: `limited:${node.id}`,
          severity: "warn",
          nodeId: node.id,
          title: `${node.name} is turning away ${percent(share)} of requests.`,
          detail:
            node.params.scope === "key"
              ? `Some keys send more than ${limit} each.`
              : `They're over its limit of ${limit}.`,
          fix: "If that traffic is real, raise the limit. If it isn't, it's doing its job.",
        });
      }
      continue;
    }

    if (overloaded(m)) {
      // If what it calls is overloaded too, it's waiting on that: a symptom, not the cause.
      if (downstream(doc, node.id).some((id) => overloaded(metricsOf(id)))) continue;
      if (feedsFromBacklog(node.id)) continue; // the queue's note says it
      const isDatabase = node.type === "database" || node.type === "sharded-database";
      const hot = hotShard(m);
      const fix =
        isDatabase && anySearches(doc) && !doc.nodes.some((n) => n.type === "search-index")
          ? "Searches scan every row. Add a search index: connect your services to it, and the database to it so it stays up to date."
          : hot
            ? hotShardFix(node.params.spread)
            : isDatabase && mostlyWrites(doc)
              ? "Most of its work is writes, which a cache or a replica can't take. Put a queue in front to absorb them, or give it more connections."
              : capacity?.fix;
      const shardNote = hot ? ` ${hotShardNote(hot, m.shards?.length ?? 0)}` : "";
      bottlenecks.push(node);
      const wait = waitMs(m);
      const waiting =
        m.waiting >= 1
          ? `${Math.round(m.waiting) === 1 ? "1 request is" : `${count(m.waiting)} requests are`} waiting${wait !== null ? `, about ${duration(wait)} each` : ""}.`
          : `It's ${percent(m.utilization)} busy.`;
      const turnedAway =
        share >= FAILING ? ` It's turning away ${percent(share)} of requests.` : "";
      insights.push({
        id: `overloaded:${node.id}`,
        severity: "fail",
        nodeId: node.id,
        title: `${node.name} ${capacity?.full ?? "is overloaded"}.`,
        detail: waiting + shardNote + turnedAway + spentAt(node.id),
        ...(fix ? { fix } : {}),
      });
      continue;
    }

    if (share >= FAILING) {
      const full = m.drops > 0;
      insights.push({
        id: `failing:${node.id}`,
        severity: "fail",
        nodeId: node.id,
        title: full
          ? `${node.name} is turning away ${percent(share)} of requests.`
          : `${node.name} fails ${percent(share)} of requests.`,
        detail: full ? "Its line is full." : "That's its own error rate.",
        ...(full && capacity ? { fix: capacity.fix } : {}),
      });
      continue;
    }

    if (m.utilization > NEAR_LIMIT && node.type in CAPACITY) {
      // A hot shard is the reason a sharded database is near its limit: say so.
      const hot = hotShard(m);
      insights.push({
        id: `near:${node.id}`,
        severity: "warn",
        nodeId: node.id,
        title: hot ? `${node.name} has a hot shard.` : `${node.name} is close to its limit.`,
        detail: hot
          ? `${hotShardNote(hot, m.shards?.length ?? 0)} A little more traffic and requests start to wait.`
          : `It's ${percent(m.utilization)} busy: a little more traffic and requests start to wait.`,
        ...(hot ? { fix: hotShardFix(node.params.spread) } : capacity ? { fix: capacity.fix } : {}),
      });
    }
  }

  // Users giving up: say where the wait is.
  for (const client of doc.nodes.filter((n) => n.type === "client")) {
    const m = metricsOf(client.id);
    const timeout = Number(client.params.timeout ?? 0);
    if (!m?.latency || m.errorRate < FAILING) continue;
    if (m.latency.p99 < timeout * 0.95) {
      // Without an address, nothing can be sent (S43c).
      const lookups = downstream(doc, client.id).filter((id) => nodes.get(id)?.type === "dns");
      if (lookups.length > 0 && lookups.every((id) => metricsOf(id)?.down)) {
        insights.push({
          id: `errors:${client.id}`,
          severity: "fail",
          nodeId: lookups[0] as string,
          title: `${percent(m.errorRate)} of requests from ${client.name} fail.`,
          detail: `Its users can't look up where to send them: ${listNames(lookups.map(nameOf))} ${lookups.length === 1 ? "is" : "are"} down.`,
        });
        continue;
      }
      // Failing, not timing out: say where most of the failures start (S30's "failed here").
      const source = mostFailures(snapshot, servers);
      insights.push({
        id: `errors:${client.id}`,
        severity: "fail",
        nodeId: source?.id ?? client.id,
        title: `${percent(m.errorRate)} of requests from ${client.name} fail.`,
        detail: source
          ? `Most of them fail at ${source.name}.`
          : "They fail on the way, not at a component.",
      });
      continue;
    }
    const culprit = bottlenecks[0] ?? slowest(snapshot, servers);
    insights.push({
      id: `timeouts:${client.id}`,
      severity: "fail",
      nodeId: culprit?.id ?? client.id,
      title: `Requests from ${client.name} are timing out.`,
      detail:
        (culprit
          ? `${percent(m.errorRate)} give up after ${duration(timeout)}. The wait is in ${culprit.name}.`
          : `${percent(m.errorRate)} give up after ${duration(timeout)}.`) +
        // Once only: a bottleneck's own note already says where the time went.
        (culprit && !bottlenecks.includes(culprit) ? spentAt(culprit.id) : ""),
    });
  }

  // Caches that don't help much.
  if (snapshot.time >= CACHE_WARMUP_MS) {
    for (const cache of doc.nodes.filter((n) => n.type === "cache")) {
      const m = metricsOf(cache.id);
      if (!m || m.down || m.hitRatio == null || m.arrivals < 10 || m.hitRatio >= LOW_HIT_RATIO) {
        continue;
      }
      const clients = doc.nodes.filter((n) => n.type === "client");
      const uniform = clients.some((c) => c.params.keyPopularity === "uniform");
      const keys = Math.max(0, ...clients.map((c) => Number(c.params.keys ?? 0)));
      const size = Number(cache.params.size ?? 0);
      insights.push({
        id: `low-hits:${cache.id}`,
        severity: "warn",
        nodeId: cache.id,
        title: `${cache.name} answers only ${percent(m.hitRatio)} of lookups.`,
        detail: uniform
          ? "Every key is equally popular, so it can't keep the ones that matter."
          : size < keys / 10
            ? `It holds ${count(size)} keys out of ${count(keys)}, so most lookups miss.`
            : "Entries expire before they're asked for again.",
        ...(uniform ? {} : { fix: "Let it hold more keys, or keep entries longer (TTL)." }),
      });
    }
  }

  // Queues falling behind.
  for (const queue of doc.nodes.filter((n) => n.type === "queue")) {
    const m = metricsOf(queue.id);
    if (!m || m.down || m.waiting < BACKLOG) continue;
    const growth = backlogGrowth.get(queue.id) ?? 0;
    const oldest = m.oldestJobAge ? ` The oldest has waited ${duration(m.oldestJobAge)}.` : "";
    const flatOut = downstream(doc, queue.id).filter((id) => overloaded(metricsOf(id)));
    const why =
      flatOut.length === 0
        ? ""
        : ` ${listNames(flatOut.map(nameOf))} ${flatOut.length === 1 ? "is" : "are"} busy with every job ${flatOut.length === 1 ? "it" : "they"} can take.`;
    insights.push(
      growth > 0.5
        ? {
            id: `backlog:${queue.id}`,
            severity: "fail",
            nodeId: queue.id,
            title: `${queue.name} is falling behind.`,
            detail: `${count(m.waiting)} jobs are waiting${growth >= 1.5 ? `, about ${Math.round(growth)} more each second` : ", and it keeps growing"}.${why}${oldest}`,
            fix: "Add a worker, or raise Jobs at once.",
          }
        : {
            id: `backlog:${queue.id}`,
            severity: "warn",
            nodeId: queue.id,
            title: `${queue.name} has ${count(m.waiting)} jobs waiting.`,
            detail: `It isn't growing.${oldest}`,
          },
    );
  }

  // Pub/sub subscribers falling behind (S43c): each has its own backlog.
  for (const topic of doc.nodes.filter((n) => n.type === "pubsub")) {
    const m = metricsOf(topic.id);
    if (!m || m.down) continue;
    const capacity = Number(topic.params.capacity ?? Number.POSITIVE_INFINITY);
    for (const s of m.subscriptions ?? []) {
      if (s.waiting < BACKLOG) continue;
      const name = nameOf(s.node);
      const growth = backlogGrowth.get(backlogKey(topic.id, s.node)) ?? 0;
      const oldest = s.oldestAge ? ` The oldest has waited ${duration(s.oldestAge)}.` : "";
      // A second worker subscribing would get its own copy of everything, not share the work.
      const fix =
        nodes.get(s.node)?.type === "worker"
          ? {
              fix: "Raise its Jobs at once, or subscribe a queue instead and put more workers behind it.",
            }
          : {};
      const base = { id: `backlog:${topic.id}:${s.node}`, nodeId: s.node };
      if (s.waiting >= capacity * 0.99) {
        insights.push({
          ...base,
          severity: "fail",
          title: `${name} is missing messages from ${topic.name}.`,
          detail: `Its backlog of ${count(s.waiting)} is full, so new messages for it are lost.${oldest}`,
          ...fix,
        });
      } else if (growth > 0.5) {
        insights.push({
          ...base,
          severity: "fail",
          title: `${name} is falling behind on ${topic.name}.`,
          detail: `${count(s.waiting)} messages are waiting for it${growth >= 1.5 ? `, about ${Math.round(growth)} more each second` : ", and it keeps growing"}. The other subscribers aren't held up.${oldest}`,
          ...fix,
        });
      } else {
        insights.push({
          ...base,
          severity: "warn",
          title: `${count(s.waiting)} messages from ${topic.name} are waiting for ${name}.`,
          detail: `It isn't growing.${oldest}`,
        });
      }
    }
  }

  // Replicas and search indexes serving old data.
  for (const copy of doc.nodes.filter(
    (n) => n.type === "read-replica" || n.type === "search-index",
  )) {
    const m = metricsOf(copy.id);
    if (!m || m.down || m.staleReads == null || m.staleReads < STALE) continue;
    const index = copy.type === "search-index";
    const lag = Number((index ? copy.params.indexingDelay : copy.params.replicationLag) ?? 0);
    insights.push({
      id: `stale:${copy.id}`,
      severity: "warn",
      nodeId: copy.id,
      title: index
        ? `${percent(m.staleReads)} of searches on ${copy.name} miss recent writes.`
        : `${percent(m.staleReads)} of reads from ${copy.name} miss recent writes.`,
      detail: index
        ? `Writes take about ${duration(lag)} to be indexed.`
        : `Writes take about ${duration(lag)} to reach it.`,
      fix: index
        ? "A shorter indexing delay means fresher results."
        : "A shorter replication lag means fewer stale reads.",
    });
  }

  // Slow, with nothing above explaining it: say where a slow request's time went.
  const p99 = snapshot.system.latency?.p99 ?? 0;
  if (spent && blamed && p99 >= SLOW_P99_MS && !insights.some((i) => i.nodeId === blamed)) {
    const node = nodes.get(blamed);
    const capacity = node ? CAPACITY[node.type] : undefined;
    insights.push({
      id: `slow:${blamed}`,
      severity: "warn",
      nodeId: blamed,
      title: `Requests are slow: p99 is ${duration(p99)}.`,
      detail: spentText,
      ...(spent.waited >= spent.worked
        ? capacity
          ? { fix: capacity.fix }
          : {}
        : { fix: "That's its own work: a cache in front of it would let requests skip it." }),
    });
  }

  // Worst first: failures before warnings, keeping the order found within each.
  return insights.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
}

type Spent = { node: string; share: number; waited: number; worked: number; total: number };

/** The component that took most of a recent slow request's time, if one took at least TIME_SHARE. */
function timeSpent(snapshot: MetricsSnapshot, trace: TraceRecord | null): Spent | null {
  if (!trace || snapshot.time - trace.finishedAt > TRACE_FRESH_MS) return null;
  const top = whereTimeWent(trace)[0];
  if (!top || top.share < TIME_SHARE) return null;
  return { ...top, total: trace.finishedAt - trace.startedAt };
}

/**
 * "In a slow request just now, 82% of its 2 s was spent waiting in line at
 * Links DB." With `behind`: "…at Shortener API · 1, whose requests are all
 * waiting on Links DB."
 */
function spentSentence(spent: Spent, name: string, behind: string | null): string {
  const how = spent.waited >= spent.worked ? "waiting in line at" : "being worked on at";
  const why = behind ? `, whose requests are all waiting on ${behind}` : "";
  return `In a slow request just now, ${percent(spent.share)} of its ${duration(spent.total)} was spent ${how} ${name}${why}.`;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Whether the clients, weighted by their rate, send more writes than reads. */
function mostlyWrites(doc: SystemDocument): boolean {
  let rate = 0;
  let writes = 0;
  for (const client of doc.nodes.filter((n) => n.type === "client")) {
    const r = Number(client.params.rate ?? 0);
    rate += r;
    writes += (r * (100 - Number(client.params.readShare ?? 100))) / 100;
  }
  return rate > 0 && writes / rate > 0.5;
}

/** The component where the most failures start, if any do. */
function mostFailures(
  snapshot: MetricsSnapshot,
  servers: readonly SystemNode[],
): SystemNode | undefined {
  let worst: SystemNode | undefined;
  let most = 0;
  for (const node of servers) {
    const failures = snapshot.nodes[node.id]?.failures ?? 0;
    if (failures > most) {
      worst = node;
      most = failures;
    }
  }
  return worst;
}

/** The non-client component with the highest p99, if any finished requests. */
function slowest(
  snapshot: MetricsSnapshot,
  servers: readonly SystemNode[],
): SystemNode | undefined {
  let worst: SystemNode | undefined;
  let worstP99 = 0;
  for (const node of servers) {
    const p99 = snapshot.nodes[node.id]?.latency?.p99 ?? 0;
    if (p99 > worstP99) {
      worst = node;
      worstP99 = p99;
    }
  }
  return worst;
}

/**
 * DNS down (S43c): what happens depends on what users have cached. Nothing
 * breaks at first; requests fail more and more as answers expire.
 */
function dnsDown(dns: SystemNode, doc: SystemDocument, snapshot: MetricsSnapshot): Insight {
  const name = (id: string) => doc.nodes.find((n) => n.id === id)?.name ?? id;
  const up = (id: string) =>
    doc.nodes.some((n) => n.id === id && n.type === "dns") && !snapshot.nodes[id]?.down;
  const clients = doc.edges.filter((e) => e.target === dns.id).map((e) => e.source);
  // Clients with another DNS that's up look there instead.
  const others = (client: string) =>
    downstream(doc, client).filter((id) => id !== dns.id && up(id));
  const stranded = clients.filter((client) => others(client).length === 0);
  const base = { id: `down:${dns.id}`, nodeId: dns.id, title: `${dns.name} is down.` };
  if (clients.length > 0 && stranded.length === 0) {
    const fallback = [...new Set(clients.flatMap(others))].map(name);
    return {
      ...base,
      severity: "warn",
      detail: `Its clients look up addresses at ${listNames(fallback)} instead.`,
      fix: "Bring it back (select it and press K).",
    };
  }
  const cached =
    stranded.reduce((sum, id) => sum + (snapshot.nodes[id]?.dnsCached ?? 0), 0) /
    Math.max(1, stranded.length);
  const ttl = Number(dns.params.ttl ?? 0) * 1000;
  return {
    ...base,
    severity: "fail",
    detail:
      cached > 0
        ? `Users with a cached answer carry on, and the rest can't reach the system. ${percent(cached)} still have one; they all expire within ${duration(ttl)}.`
        : "Every cached answer has expired, so no one can reach the system.",
    fix: "Bring it back (select it and press K). A second DNS, or a longer Answer TTL, rides out an outage like this.",
  };
}
