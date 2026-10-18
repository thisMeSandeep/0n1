import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  type EdgeMetrics,
  edgeKey,
  type MetricsSnapshot,
  type NodeMetrics,
  type SystemMetrics,
} from "../engine/metrics/recorder.ts";
import type { Insight } from "../insights/rules.ts";
import { InsightTracker } from "../insights/tracker.ts";
import type { LiveDetail } from "../model/component.ts";
import type { SystemEdge } from "../model/document.ts";
import type { Registry } from "../model/registry.ts";
import type { DesignStore } from "../store/design.ts";
import {
  formatClock,
  formatCompact,
  formatDuration,
  formatPercent,
  type Measure,
} from "./format.ts";
import type { SimulationStore } from "./store.ts";

/*
 * What the canvas shows while a system runs (UIUX §6, §8). Snapshots arrive
 * about 10 times a second; text only needs to change about 4 times, so this
 * view publishes at most every 250 ms, already formatted. A component whose
 * numbers didn't change keeps the same object, so only components whose
 * numbers changed re-render.
 */

/** Text values change at most this often (UIUX §8: 4 times a second). */
export const LIVE_INTERVAL_MS = 250;
/** Points kept for each sparkline: 30 seconds at 1×. */
export const TREND_POINTS = 120;

/** Above this utilization a component is busy (UIUX §6). */
export const BUSY_UTILIZATION = 0.7;
/** Above this it's overloaded. */
export const OVERLOADED_UTILIZATION = 0.9;
/** From this share of failed or turned-away requests, a component is failing. */
export const FAILING_ERRORS = 0.005;

export type NodeStatus = "healthy" | "busy" | "failing" | "down";

export type NodeLive = {
  status: NodeStatus;
  /** Requests finished per second (sent, for clients). */
  rate: string;
  /** The number beside the rate: "p99 84 ms", "hit 45%", "waiting 1.2k", or just "sent". */
  detail: { label: string } & Partial<Measure>;
  /** Share of capacity in use, 0–1, rounded to a percent. */
  utilization: number;
  /** Share of requests that failed or were turned away. */
  errors: Measure;
  /** Errors worth a badge. */
  hasErrors: boolean;
  /** Requests waiting in line. */
  waiting: string;
  /** "01:52" when it's down. */
  downSince: string | null;
  /** Slowed down by the chaos timeline (S40): how many times longer its work takes. */
  slowed: number | null;
};

export type Trend = { label: string; unit: string; values: readonly number[] };

/** From this share of failed replies a connection turns amber, and from this one red (UIUX §6). */
export const EDGE_WARN_ERRORS = FAILING_ERRORS;
export const EDGE_FAIL_ERRORS = 0.05;
/** Most flow dots on one connection. */
export const MAX_DOTS = 6;

/** `cut`: the chaos timeline (S40) has cut it; requests on it fail at once. */
export type EdgeStatus = "idle" | "healthy" | "warn" | "fail" | "down" | "cut";

export type EdgeLive = {
  status: EdgeStatus;
  /** Stroke width: 1.5px, growing on a log scale to 4px at 100k requests a second. */
  width: number;
  /** Flow dots: none without traffic, one more for every tenfold rate, up to MAX_DOTS. */
  dots: number;
  rate: string;
  latency: Measure | null;
  errors: Measure;
};

/** The vitals turn amber or red past these (UIUX §3): p99 as users see it, in ms… */
export const SYSTEM_P99_WARN_MS = 500;
export const SYSTEM_P99_FAIL_MS = 1000;
/** …and the share of users' requests that fail. */
export const SYSTEM_ERRORS_WARN = FAILING_ERRORS;
export const SYSTEM_ERRORS_FAIL = 0.05;

export type Level = "ok" | "warn" | "fail";

/** The whole system as users see it: the vitals pill. */
export type SystemLive = {
  throughput: string;
  p99: Measure | null;
  p99Level: Level;
  errors: Measure;
  errorsLevel: Level;
};

export function levelOf(value: number, warn: number, fail: number): Level {
  return value >= fail ? "fail" : value >= warn ? "warn" : "ok";
}

export function systemLive(m: SystemMetrics): SystemLive {
  const p99 = m.latency?.p99 ?? null;
  return {
    throughput: formatCompact(m.throughput),
    p99: p99 === null ? null : formatDuration(p99),
    p99Level: p99 === null ? "ok" : levelOf(p99, SYSTEM_P99_WARN_MS, SYSTEM_P99_FAIL_MS),
    errors: formatPercent(m.errorRate),
    errorsLevel: levelOf(m.errorRate, SYSTEM_ERRORS_WARN, SYSTEM_ERRORS_FAIL),
  };
}

const sameSystemLive = (a: SystemLive | null, b: SystemLive) =>
  a !== null &&
  a.throughput === b.throughput &&
  sameMeasure(a.p99, b.p99) &&
  a.p99Level === b.p99Level &&
  sameMeasure(a.errors, b.errors) &&
  a.errorsLevel === b.errorsLevel;

export type LiveState = {
  /** A run has been loaded: there are numbers to show. */
  started: boolean;
  /** The snapshot this state was made from, for views that list every number. */
  snapshot: MetricsSnapshot | null;
  system: SystemLive | null;
  nodes: Readonly<Record<string, NodeLive>>;
  /** Connections, by the document's edge id. */
  edges: Readonly<Record<string, EdgeLive>>;
  /** Recent values of each component's detail number (or its rate), for sparklines. */
  trends: Readonly<Record<string, Trend>>;
  /** What's wrong, in plain English (S41), worst first. */
  insights: readonly Insight[];
};

export const EMPTY_LIVE: LiveState = {
  started: false,
  snapshot: null,
  system: null,
  nodes: {},
  edges: {},
  trends: {},
  insights: [],
};
const EMPTY = EMPTY_LIVE;

const sameInsights = (a: readonly Insight[], b: readonly Insight[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    return y !== undefined && x.id === y.id && x.title === y.title && x.detail === y.detail;
  });

/**
 * Share of requests that failed here: turned away, or its own errors. Not
 * failures passed back from components behind it, so the badge sits where
 * the trouble is. A client's is what its users see, wherever it failed.
 */
function failingShare(m: NodeMetrics, detail: LiveDetail): number {
  if (detail === "sent") return m.errorRate;
  return m.arrivals > 0 ? Math.min(1, m.failures / m.arrivals) : 0;
}

function statusOf(m: NodeMetrics, detail: LiveDetail, errors: number): NodeStatus {
  if (m.down) return "down";
  // A client's own numbers are the system's; the failure is somewhere downstream.
  if (detail === "sent") return "healthy";
  if (m.utilization > OVERLOADED_UTILIZATION || errors >= FAILING_ERRORS) return "failing";
  if (m.utilization > BUSY_UTILIZATION) return "busy";
  return "healthy";
}

function detailOf(m: NodeMetrics, detail: LiveDetail): NodeLive["detail"] {
  switch (detail) {
    case "sent":
      return { label: "sent" };
    case "hit":
      return m.hitRatio == null
        ? { label: "hit", value: "—" }
        : { label: "hit", ...formatPercent(m.hitRatio) };
    case "waiting":
      return { label: "waiting", value: formatCompact(m.waiting), unit: "" };
    case "p99":
      return m.latency
        ? { label: "p99", ...formatDuration(m.latency.p99) }
        : { label: "p99", value: "—" };
  }
}

/** The view of one component's metrics. */
export function nodeLive(
  m: NodeMetrics,
  detail: LiveDetail = "p99",
  slowed: number | null = null,
): NodeLive {
  const errors = failingShare(m, detail);
  return {
    status: statusOf(m, detail, errors),
    rate: formatCompact(detail === "sent" ? m.arrivals : m.throughput),
    detail: detailOf(m, detail),
    utilization: Math.round(Math.min(1, m.utilization) * 100) / 100,
    errors: formatPercent(errors),
    // Not on clients: users seeing errors shows where the system fails, not here.
    hasErrors: !m.down && detail !== "sent" && errors >= FAILING_ERRORS,
    waiting: formatCompact(m.waiting),
    downSince: m.down && m.downSince != null ? formatClock(m.downSince) : null,
    slowed: m.down ? null : slowed,
  };
}

function trendPoint(
  m: NodeMetrics,
  detail: LiveDetail,
): { label: string; unit: string; value: number } {
  switch (detail) {
    case "sent":
      return { label: "Sent", unit: "/s", value: m.arrivals };
    case "hit":
      return { label: "Hit ratio", unit: "%", value: (m.hitRatio ?? 0) * 100 };
    case "waiting":
      return { label: "Waiting", unit: "", value: m.waiting };
    case "p99":
      return { label: "p99", unit: "ms", value: m.latency?.p99 ?? 0 };
  }
}

/** A connection's view. `down`: either end is down. */
export function edgeLive(m: EdgeMetrics | undefined, down: boolean, cut = false): EdgeLive {
  const rate = m?.rate ?? 0;
  const errorRate = m?.errorRate ?? 0;
  const scale = Math.min(1, Math.log10(1 + rate) / 5);
  const status: EdgeStatus = cut
    ? "cut"
    : down
      ? "down"
      : rate <= 0
        ? "idle"
        : errorRate >= EDGE_FAIL_ERRORS
          ? "fail"
          : errorRate >= EDGE_WARN_ERRORS
            ? "warn"
            : "healthy";
  return {
    status,
    width: Math.round((1.5 + 2.5 * scale) * 4) / 4,
    dots:
      down || cut || rate <= 0
        ? 0
        : Math.min(MAX_DOTS, 1 + Math.max(0, Math.floor(Math.log10(rate)))),
    rate: formatCompact(rate),
    latency: m?.latency ? formatDuration(m.latency.p99) : null,
    errors: formatPercent(errorRate),
  };
}

const sameMeasure = (a: Partial<Measure> | null, b: Partial<Measure> | null) =>
  a === b || (a !== null && b !== null && a.value === b.value && a.unit === b.unit);

export function sameEdgeLive(a: EdgeLive, b: EdgeLive): boolean {
  return (
    a.status === b.status &&
    a.width === b.width &&
    a.dots === b.dots &&
    a.rate === b.rate &&
    sameMeasure(a.latency, b.latency) &&
    sameMeasure(a.errors, b.errors)
  );
}

export function sameNodeLive(a: NodeLive, b: NodeLive): boolean {
  return (
    a.status === b.status &&
    a.rate === b.rate &&
    a.detail.label === b.detail.label &&
    sameMeasure(a.detail, b.detail) &&
    a.utilization === b.utilization &&
    sameMeasure(a.errors, b.errors) &&
    a.hasErrors === b.hasErrors &&
    a.waiting === b.waiting &&
    a.downSince === b.downSince &&
    a.slowed === b.slowed
  );
}

/**
 * The next live state from a snapshot. Unchanged components keep their
 * objects; trends grow by a point when simulated time moved on, and start
 * over when it went back (a reset or reload).
 */
export function nextLiveState(
  previous: LiveState,
  previousTime: number | null,
  snapshot: MetricsSnapshot | null,
  detailOfNode: (id: string) => LiveDetail,
  docEdges: readonly SystemEdge[] = [],
): LiveState {
  if (!snapshot) return previous.started ? EMPTY : previous;
  const restarted = previousTime === null || snapshot.time < previousTime;
  const advanced = !restarted && snapshot.time > (previousTime as number);

  let changed = false;
  const nodes: Record<string, NodeLive> = {};
  const trends: Record<string, Trend> = {};
  for (const [id, metrics] of Object.entries(snapshot.nodes)) {
    const detail = detailOfNode(id);
    const view = nodeLive(metrics, detail, snapshot.faults.slowed[id] ?? null);
    const before = previous.nodes[id];
    if (before && sameNodeLive(before, view)) {
      nodes[id] = before;
    } else {
      nodes[id] = view;
      changed = true;
    }

    const point = trendPoint(metrics, detail);
    const prior = restarted ? undefined : previous.trends[id];
    if (prior && !advanced) {
      trends[id] = prior;
    } else {
      const values = prior ? [...prior.values, point.value].slice(-TREND_POINTS) : [point.value];
      trends[id] = { label: point.label, unit: point.unit, values };
    }
  }
  if (Object.keys(previous.nodes).length !== Object.keys(nodes).length) changed = true;

  let edgesChanged = Object.keys(previous.edges).length !== docEdges.length;
  const edges: Record<string, EdgeLive> = {};
  for (const edge of docEdges) {
    const down = Boolean(snapshot.nodes[edge.source]?.down || snapshot.nodes[edge.target]?.down);
    const key = edgeKey(edge.source, edge.target);
    const view = edgeLive(snapshot.edges[key], down, snapshot.faults.cut.includes(key));
    const before = previous.edges[edge.id];
    if (before && sameEdgeLive(before, view)) {
      edges[edge.id] = before;
    } else {
      edges[edge.id] = view;
      edgesChanged = true;
    }
  }

  const system = systemLive(snapshot.system);
  return {
    started: true,
    snapshot,
    system: sameSystemLive(previous.system, system) ? previous.system : system,
    nodes: changed ? nodes : previous.nodes,
    edges: edgesChanged ? edges : previous.edges,
    trends: advanced || restarted ? trends : previous.trends,
    // Worked out by createLiveView, which keeps their history (InsightTracker).
    insights: previous.insights,
  };
}

export type LiveTimers = {
  now(): number;
  later(ms: number, run: () => void): () => void;
};

const browserTimers: LiveTimers = {
  now: () => performance.now(),
  later: (ms, run) => {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

/**
 * A store of the live view, fed by the simulation store, publishing at most
 * every LIVE_INTERVAL_MS. The latest snapshot always lands (a trailing
 * update), so a pause shows its final numbers.
 */
export function createLiveView({
  simulation,
  design,
  registry,
  timers = browserTimers,
}: {
  simulation: SimulationStore;
  design: DesignStore;
  registry: Registry;
  timers?: LiveTimers;
}) {
  const store = createStore<LiveState>(() => EMPTY);
  let lastTime: number | null = null;
  let lastPublish = Number.NEGATIVE_INFINITY;
  let cancelPending: (() => void) | null = null;

  const detailOfNode = (id: string): LiveDetail => {
    const node = design.getState().doc.nodes.find((n) => n.id === id);
    const definition = node && registry.get(node.type);
    return definition?.liveDetail ?? "p99";
  };

  const tracker = new InsightTracker();

  const publish = () => {
    cancelPending = null;
    lastPublish = timers.now();
    const { snapshot } = simulation.getState();
    const { doc } = design.getState();
    const previous = store.getState();
    const next = nextLiveState(previous, lastTime, snapshot, detailOfNode, doc.edges);
    if (!snapshot) tracker.reset();
    const slowTrace = simulation.getState().traces.find((t) => t.reason === "slow") ?? null;
    const insights = snapshot ? tracker.update(snapshot, doc, slowTrace) : [];
    store.setState(
      {
        ...next,
        insights: sameInsights(previous.insights, insights) ? previous.insights : insights,
      },
      true,
    );
    lastTime = snapshot?.time ?? null;
  };

  simulation.subscribe((state, previous) => {
    if (state.snapshot === previous.snapshot) return;
    // Starting over shows at once: 00:00 shouldn't keep the old numbers for a moment.
    const restart = !state.snapshot || lastTime === null || state.snapshot.time < lastTime;
    const wait = lastPublish + LIVE_INTERVAL_MS - timers.now();
    if (restart || wait <= 0) {
      cancelPending?.();
      publish();
    } else {
      cancelPending ??= timers.later(wait, publish);
    }
  });

  return store;
}

export type LiveView = ReturnType<typeof createLiveView>;

export function useLiveView<T>(live: LiveView, selector: (state: LiveState) => T): T {
  return useStore(live, selector);
}
