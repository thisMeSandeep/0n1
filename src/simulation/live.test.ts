import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import type { MetricsSnapshot, NodeMetrics } from "../engine/metrics/recorder.ts";
import { createSystemDocument } from "../model/document.ts";
import { createDesignStore } from "../store/design.ts";
import {
  createLiveView,
  edgeLive,
  LIVE_INTERVAL_MS,
  type LiveState,
  type LiveTimers,
  nextLiveState,
  nodeLive,
  TREND_POINTS,
} from "./live.ts";
import { createSimulationStore } from "./store.ts";

const metrics = (patch: Partial<NodeMetrics> = {}): NodeMetrics => ({
  arrivals: 100,
  throughput: 100,
  errorRate: 0,
  drops: 0,
  failures: 0,
  latency: { mean: 10, p50: 8, p95: 20, p99: 42 },
  utilization: 0.3,
  inFlight: 3,
  waiting: 0,
  totals: { arrived: 0, completed: 0, failed: 0, dropped: 0 },
  ...patch,
});

const snapshot = (
  time: number,
  nodes: Record<string, NodeMetrics>,
  edges: MetricsSnapshot["edges"] = {},
): MetricsSnapshot => ({
  time,
  sampling: { weight: 1 },
  system: { goodput: 0, throughput: 0, errorRate: 0, latency: null },
  nodes,
  edges,
});

const EMPTY: LiveState = { started: false, nodes: {}, edges: {}, trends: {} };
const p99 = () => "p99" as const;

describe("a component's live view", () => {
  it("shows its rate and p99", () => {
    const view = nodeLive(
      metrics({ throughput: 1480, latency: { mean: 1, p50: 1, p95: 1, p99: 1380 } }),
    );
    expect(view).toMatchObject({
      status: "healthy",
      rate: "1.48k",
      detail: { label: "p99", value: "1.38", unit: "s" },
      utilization: 0.3,
      hasErrors: false,
    });
  });

  it("is busy above 70% utilization and failing above 90%", () => {
    expect(nodeLive(metrics({ utilization: 0.7 })).status).toBe("healthy");
    expect(nodeLive(metrics({ utilization: 0.82 })).status).toBe("busy");
    expect(nodeLive(metrics({ utilization: 0.97 })).status).toBe("failing");
  });

  it("is failing with errors that started here", () => {
    const failing = nodeLive(metrics({ throughput: 90, drops: 10, failures: 10 }));
    expect(failing).toMatchObject({ status: "failing", hasErrors: true, errors: { value: "10" } });
    const few = nodeLive(metrics({ arrivals: 1000, failures: 1 }));
    expect(few).toMatchObject({ status: "healthy", hasErrors: false });
  });

  it("doesn't blame a component for failures behind it", () => {
    // Half its requests fail, all of them further on.
    const relaying = nodeLive(metrics({ errorRate: 0.5, failures: 0 }));
    expect(relaying).toMatchObject({ status: "healthy", hasErrors: false, errors: { value: "0" } });
  });

  it("shows when it went down instead of numbers", () => {
    const view = nodeLive(metrics({ down: true, downSince: 112_000, utilization: 0 }));
    expect(view).toMatchObject({ status: "down", downSince: "01:52", hasErrors: false });
  });

  it("shows the number that matters for its kind", () => {
    expect(nodeLive(metrics({ hitRatio: 0.452 }), "hit").detail).toEqual({
      label: "hit",
      value: "45",
      unit: "%",
    });
    expect(nodeLive(metrics({ waiting: 1234 }), "waiting").detail).toEqual({
      label: "waiting",
      value: "1.23k",
      unit: "",
    });
    const client = nodeLive(metrics({ arrivals: 1500, throughput: 900, errorRate: 0.5 }), "sent");
    // A client's rate is what it sends, and downstream failures aren't its own.
    expect(client).toMatchObject({
      rate: "1.50k",
      detail: { label: "sent" },
      status: "healthy",
      hasErrors: false,
      errors: { value: "50" }, // still in its details
    });
  });
});

describe("the live state", () => {
  it("keeps the objects of components whose numbers didn't change", () => {
    const first = nextLiveState(EMPTY, null, snapshot(0, { a: metrics(), b: metrics() }), p99);
    const second = nextLiveState(
      first,
      0,
      snapshot(250, { a: metrics({ throughput: 100.2 }), b: metrics({ throughput: 300 }) }),
      p99,
    );
    expect(second.nodes.a).toBe(first.nodes.a); // "100" either way
    expect(second.nodes.b).not.toBe(first.nodes.b);

    const third = nextLiveState(
      second,
      250,
      snapshot(500, { a: metrics(), b: metrics({ throughput: 300 }) }),
      p99,
    );
    expect(third.nodes).toBe(second.nodes); // nothing visible changed
  });

  it("grows trends as time moves on, and starts them over after a reset", () => {
    let state = nextLiveState(EMPTY, null, snapshot(0, { a: metrics() }), p99);
    let time = 0;
    for (let i = 1; i <= TREND_POINTS + 10; i++) {
      state = nextLiveState(state, time, snapshot(i * 250, { a: metrics() }), p99);
      time = i * 250;
    }
    expect(state.trends.a?.values).toHaveLength(TREND_POINTS);
    expect(state.trends.a?.label).toBe("p99");

    const paused = nextLiveState(
      state,
      time,
      snapshot(time, { a: metrics({ throughput: 5 }) }),
      p99,
    );
    expect(paused.trends).toBe(state.trends); // no new point without time passing

    const reset = nextLiveState(state, time, snapshot(0, { a: metrics() }), p99);
    expect(reset.trends.a?.values).toHaveLength(1);
  });

  it("empties when there's no run", () => {
    const state = nextLiveState(EMPTY, null, snapshot(0, { a: metrics() }), p99);
    expect(nextLiveState(state, 0, null, p99)).toEqual(EMPTY);
  });
});

describe("a connection's live view", () => {
  const edge = (rate: number, errorRate = 0) => ({
    rate,
    errorRate,
    latency: { mean: 30, p50: 20, p95: 60, p99: 84 },
  });

  it("grows thicker and gets more dots with traffic, on a log scale", () => {
    expect(edgeLive(undefined, false)).toMatchObject({ status: "idle", width: 1.5, dots: 0 });
    expect(edgeLive(edge(0.5), false)).toMatchObject({ width: 1.5, dots: 1 });
    expect(edgeLive(edge(1500), false)).toMatchObject({ status: "healthy", width: 3, dots: 4 });
    expect(edgeLive(edge(100_000), false)).toMatchObject({ width: 4, dots: 6 });
    expect(edgeLive(edge(10_000_000), false)).toMatchObject({ width: 4, dots: 6 });
  });

  it("turns amber, then red, as requests on it fail", () => {
    expect(edgeLive(edge(100, 0.001), false).status).toBe("healthy");
    expect(edgeLive(edge(100, 0.01), false).status).toBe("warn");
    expect(edgeLive(edge(100, 0.2), false).status).toBe("fail");
  });

  it("is down, without dots, when either end is down", () => {
    expect(edgeLive(edge(100, 1), true)).toMatchObject({ status: "down", dots: 0 });
  });

  it("labels its rate, p99 and errors", () => {
    expect(edgeLive(edge(1480, 0.003), false)).toMatchObject({
      rate: "1.48k",
      latency: { value: "84", unit: "ms" },
      errors: { value: "0.3", unit: "%" },
    });
  });

  it("is keyed by the document's edges, and kept when unchanged", () => {
    const docEdges = [{ id: "e1", source: "a", target: "b" }];
    const nodes = { a: metrics(), b: metrics() };
    const first = nextLiveState(
      EMPTY,
      null,
      snapshot(0, nodes, { "a→b": edge(100) }),
      p99,
      docEdges,
    );
    expect(first.edges.e1).toMatchObject({ rate: "100" });
    const second = nextLiveState(
      first,
      0,
      snapshot(250, nodes, { "a→b": edge(100.2) }),
      p99,
      docEdges,
    );
    expect(second.edges).toBe(first.edges);
    const down = nextLiveState(
      second,
      250,
      snapshot(500, { a: metrics(), b: metrics({ down: true }) }, { "a→b": edge(100) }),
      p99,
      docEdges,
    );
    expect(down.edges.e1?.status).toBe("down");
  });
});

describe("the live view", () => {
  function setup() {
    let now = 0;
    const pending: { at: number; run: () => void }[] = [];
    const timers: LiveTimers = {
      now: () => now,
      later: (ms, run) => {
        const entry = { at: now + ms, run };
        pending.push(entry);
        return () => pending.splice(pending.indexOf(entry), 1);
      },
    };
    const advance = (ms: number) => {
      now += ms;
      for (const entry of pending.filter((e) => e.at <= now)) {
        pending.splice(pending.indexOf(entry), 1);
        entry.run();
      }
    };
    const simulation = createSimulationStore();
    const design = createDesignStore({ registry, doc: createSystemDocument() });
    const live = createLiveView({ simulation, design, registry, timers });
    return { simulation, live, advance };
  }

  it("publishes at most 4 times a second, always ending on the latest snapshot", () => {
    const { simulation, live, advance } = setup();
    let publishes = 0;
    live.subscribe(() => publishes++);

    simulation.setState({ snapshot: snapshot(0, { a: metrics() }) });
    expect(publishes).toBe(1); // the first shows at once
    for (let i = 1; i <= 10; i++) {
      advance(100); // snapshots arrive 10 times a second
      simulation.setState({ snapshot: snapshot(i * 100, { a: metrics({ throughput: i * 50 }) }) });
    }
    expect(publishes).toBeGreaterThanOrEqual(4);
    expect(publishes).toBeLessThanOrEqual(5);

    advance(LIVE_INTERVAL_MS);
    expect(live.getState().nodes.a?.rate).toBe("500");
  });

  it("shows a reset at once", () => {
    const { simulation, live, advance } = setup();
    simulation.setState({ snapshot: snapshot(5000, { a: metrics({ throughput: 900 }) }) });
    advance(50);
    simulation.setState({ snapshot: snapshot(0, { a: metrics({ throughput: 0 }) }) });
    expect(live.getState().nodes.a?.rate).toBe("0");
  });
});
