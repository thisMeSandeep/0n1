import type { LatencyHistogram } from "./histogram.ts";
import {
  DEFAULT_WINDOW,
  RateCounter,
  TimeWeightedGauge,
  WindowedHistogram,
  type WindowOptions,
} from "./windows.ts";

/** What a component is doing, over the recent window. Rates are per second. */
export type NodeMetrics = {
  /** Requests arriving. */
  arrivals: number;
  /** Requests finishing (successfully or not). */
  throughput: number;
  /** Share of finished requests that failed, 0–1, wherever they failed. */
  errorRate: number;
  /**
   * Failures per second that started here (turned away, its own errors),
   * not ones passed on from components behind it.
   */
  failures: number;
  /** Requests turned away before being handled (line full, rate limited, down). */
  drops: number;
  /** Time from arrival to finishing, including waiting in line. Null if nothing finished. */
  latency: { mean: number; p50: number; p95: number; p99: number } | null;
  /** Average share of capacity in use, 0–1. */
  utilization: number;
  /** Caches and CDNs: share of lookups answered without the origin, 0–1. Null if no lookups yet. */
  hitRatio?: number | null;
  /** Read replicas: share of reads that missed a recent write, 0–1. */
  staleReads?: number | null;
  /** Queues: how long the oldest waiting job has waited (ms). Null when empty. */
  oldestJobAge?: number | null;
  /** Taken down (S27). */
  down?: boolean;
  /** When it was taken down (simulated ms), if it's down. */
  downSince?: number | null;
  /** Right now. */
  inFlight: number;
  waiting: number;
  totals: { arrived: number; completed: number; failed: number; dropped: number };
};

/** The whole system as clients experience it. */
export type SystemMetrics = {
  /** Successful responses per second. */
  goodput: number;
  /** Responses per second, good or not. */
  throughput: number;
  /** Share of responses that failed or timed out, 0–1. */
  errorRate: number;
  latency: NodeMetrics["latency"];
};

function latencySummary(histogram: LatencyHistogram): NodeMetrics["latency"] {
  if (histogram.count === 0) return null;
  return {
    mean: histogram.mean as number,
    p50: histogram.quantile(0.5) as number,
    p95: histogram.quantile(0.95) as number,
    p99: histogram.quantile(0.99) as number,
  };
}

/** Records one component's activity and turns it into NodeMetrics on demand. */
export class NodeRecorder {
  #arrivals: RateCounter;
  #completed: RateCounter;
  #failed: RateCounter;
  #dropped: RateCounter;
  #originated: RateCounter;
  #latency: WindowedHistogram;
  #busy: TimeWeightedGauge;
  #lookups: RateCounter | null = null;
  #hits: RateCounter | null = null;
  #reads: RateCounter | null = null;
  #stale: RateCounter | null = null;
  #window: WindowOptions;
  #capacity = 1;
  #rateCapacity: number | null = null;
  /** Undefined until a queue reports; then the oldest job's enqueue time, or null. */
  #oldestSince: number | null | undefined = undefined;
  #inFlight = 0;
  #waiting = 0;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#window = options;
    this.#arrivals = new RateCounter(options);
    this.#completed = new RateCounter(options);
    this.#failed = new RateCounter(options);
    this.#dropped = new RateCounter(options);
    this.#originated = new RateCounter(options);
    this.#latency = new WindowedHistogram(options);
    this.#busy = new TimeWeightedGauge(options);
  }

  arrive(time: number, weight = 1): void {
    this.#arrivals.add(time, weight);
  }

  complete(time: number, latencyMs: number, ok: boolean, weight = 1): void {
    this.#completed.add(time, weight);
    if (!ok) this.#failed.add(time, weight);
    this.#latency.record(time, latencyMs, weight);
  }

  drop(time: number, weight = 1): void {
    this.#dropped.add(time, weight);
  }

  /** A failure that started here (the engine calls this as it replies). */
  originate(time: number, weight = 1): void {
    this.#originated.add(time, weight);
  }

  /** How many units of capacity are in use (e.g. busy connections) out of `capacity`. */
  setBusy(time: number, busy: number, capacity: number): void {
    this.#capacity = Math.max(1, capacity);
    this.#busy.set(time, busy);
    this.#inFlight = busy;
  }

  setWaiting(waiting: number): void {
    this.#waiting = waiting;
  }

  /** Taken down: nothing is in progress or waiting any more. */
  markDown(time: number): void {
    this.#busy.set(time, 0);
    this.#inFlight = 0;
    this.#waiting = 0;
    if (this.#oldestSince !== undefined) this.#oldestSince = null;
  }

  /** Queues: when the oldest waiting job was added, or null when empty. */
  setOldest(enqueuedAt: number | null): void {
    this.#oldestSince = enqueuedAt;
  }

  /** A cache or CDN lookup, and whether it was answered without the origin. */
  recordLookup(time: number, hit: boolean, weight = 1): void {
    this.#lookups ??= new RateCounter(this.#window);
    this.#hits ??= new RateCounter(this.#window);
    this.#lookups.add(time, weight);
    if (hit) this.#hits.add(time, weight);
  }

  /** A read at a replica, and whether it missed a write that hadn't arrived yet. */
  recordRead(time: number, stale: boolean, weight = 1): void {
    this.#reads ??= new RateCounter(this.#window);
    this.#stale ??= new RateCounter(this.#window);
    this.#reads.add(time, weight);
    if (stale) this.#stale.add(time, weight);
  }

  /** Requests in progress, for components without slots (they use setBusy). */
  setInFlight(inFlight: number): void {
    this.#inFlight = inFlight;
  }

  /**
   * For pass-through components limited by rate rather than slots (load
   * balancers, gateways): utilization becomes incoming rate ÷ this.
   */
  setRateCapacity(perSecond: number): void {
    this.#rateCapacity = perSecond > 0 ? perSecond : null;
  }

  snapshot(now: number): NodeMetrics {
    const completed = this.#completed.sum(now);
    const share = (part: RateCounter | null, whole: RateCounter | null) => {
      if (!part || !whole) return undefined;
      const total = whole.sum(now);
      return total > 0 ? part.sum(now) / total : null;
    };
    const hitRatio = share(this.#hits, this.#lookups);
    const staleReads = share(this.#stale, this.#reads);
    return {
      ...(hitRatio === undefined ? {} : { hitRatio }),
      ...(staleReads === undefined ? {} : { staleReads }),
      ...(this.#oldestSince === undefined
        ? {}
        : { oldestJobAge: this.#oldestSince === null ? null : now - this.#oldestSince }),
      arrivals: this.#arrivals.rate(now),
      throughput: this.#completed.rate(now),
      errorRate: completed > 0 ? this.#failed.sum(now) / completed : 0,
      drops: this.#dropped.rate(now),
      failures: this.#originated.rate(now),
      latency: latencySummary(this.#latency.merged(now)),
      utilization: Math.min(
        1,
        this.#rateCapacity === null
          ? this.#busy.average(now) / this.#capacity
          : this.#arrivals.rate(now) / this.#rateCapacity,
      ),
      inFlight: this.#inFlight,
      waiting: this.#waiting,
      totals: {
        arrived: this.#arrivals.total,
        completed: this.#completed.total,
        failed: this.#failed.total,
        dropped: this.#dropped.total,
      },
    };
  }
}

/** Records responses as clients see them (end to end, after retries). */
export class SystemRecorder {
  #responses: RateCounter;
  #failed: RateCounter;
  #latency: WindowedHistogram;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#responses = new RateCounter(options);
    this.#failed = new RateCounter(options);
    this.#latency = new WindowedHistogram(options);
  }

  /** A request finished for its client: answered, failed or timed out. */
  respond(time: number, latencyMs: number, ok: boolean, weight = 1): void {
    this.#responses.add(time, weight);
    if (!ok) this.#failed.add(time, weight);
    this.#latency.record(time, latencyMs, weight);
  }

  snapshot(now: number): SystemMetrics {
    const responses = this.#responses.sum(now);
    const failed = this.#failed.sum(now);
    return {
      throughput: this.#responses.rate(now),
      goodput: this.#responses.rate(now) * (responses > 0 ? 1 - failed / responses : 1),
      errorRate: responses > 0 ? failed / responses : 0,
      latency: latencySummary(this.#latency.merged(now)),
    };
  }
}

/** Traffic on one connection, as the sending component sees it. */
export type EdgeMetrics = {
  /** Requests sent per second. */
  rate: number;
  /** Share of replies that were failures, 0–1, wherever they failed. */
  errorRate: number;
  /** From sending to the reply arriving back, network included. Null if nothing came back. */
  latency: NodeMetrics["latency"];
};

/** Key for a connection's metrics: one per pair of components. */
export function edgeKey(source: string, target: string): string {
  return `${source}→${target}`;
}

export class EdgeRecorder {
  #sent: RateCounter;
  #replies: RateCounter;
  #failed: RateCounter;
  #latency: WindowedHistogram;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#sent = new RateCounter(options);
    this.#replies = new RateCounter(options);
    this.#failed = new RateCounter(options);
    this.#latency = new WindowedHistogram(options);
  }

  send(time: number, weight = 1): void {
    this.#sent.add(time, weight);
  }

  reply(time: number, latencyMs: number, ok: boolean, weight = 1): void {
    this.#replies.add(time, weight);
    if (!ok) this.#failed.add(time, weight);
    this.#latency.record(time, latencyMs, weight);
  }

  snapshot(now: number): EdgeMetrics {
    const replies = this.#replies.sum(now);
    return {
      rate: this.#sent.rate(now),
      errorRate: replies > 0 ? this.#failed.sum(now) / replies : 0,
      latency: latencySummary(this.#latency.merged(now)),
    };
  }
}

/** Everything the UI needs for one moment of a run. */
export type MetricsSnapshot = {
  /** Simulated time (ms). */
  time: number;
  /** Each simulated request stands for this many real ones (1 = no sampling). */
  sampling: { weight: number };
  system: SystemMetrics;
  nodes: Record<string, NodeMetrics>;
  /** By edgeKey(source, target); only connections that have carried traffic. */
  edges: Record<string, EdgeMetrics>;
  /** What the chaos timeline (S40) is doing right now. */
  faults: Faults;
};

/** No chaos: nothing slowed, nothing cut, no surge. */
export const NO_FAULTS: Faults = { slowed: {}, cut: [], surge: 1 };

export type Faults = {
  /** Components slowed down, by id: how many times longer their work takes. */
  slowed: Record<string, number>;
  /** Connections cut, by edgeKey. */
  cut: string[];
  /** Traffic surge multiplier (1 when there's none). */
  surge: number;
};
