import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { createSystemHistory, HISTORY_POINTS } from "./history.ts";
import { createSimulationStore } from "./store.ts";

const snapshot = (time: number, throughput = 100): MetricsSnapshot => ({
  time,
  sampling: { weight: 1 },
  system: {
    goodput: throughput,
    throughput,
    errorRate: 0.02,
    latency: { mean: 10, p50: 8, p95: 20, p99: 42 },
  },
  nodes: {},
  edges: {},
});

describe("system history", () => {
  it("keeps a point for each snapshot as time moves on", () => {
    const simulation = createSimulationStore();
    const history = createSystemHistory(simulation);
    simulation.setState({ snapshot: snapshot(0) });
    simulation.setState({ snapshot: snapshot(100, 200) });
    simulation.setState({ snapshot: snapshot(100, 300) }); // paused: no new point
    expect(history.getState()).toEqual({
      time: [0, 0.1],
      throughput: [100, 200],
      p99: [42, 42],
      errors: [2, 2],
    });
  });

  it("starts over after a reset, and empties without a run", () => {
    const simulation = createSimulationStore();
    const history = createSystemHistory(simulation);
    simulation.setState({ snapshot: snapshot(5000) });
    simulation.setState({ snapshot: snapshot(0) });
    expect(history.getState().time).toEqual([0]);
    simulation.setState({ snapshot: null });
    expect(history.getState().time).toEqual([]);
  });

  it("keeps only the latest points", () => {
    const simulation = createSimulationStore();
    const history = createSystemHistory(simulation);
    for (let i = 0; i < HISTORY_POINTS + 50; i++)
      simulation.setState({ snapshot: snapshot(i * 100) });
    expect(history.getState().time).toHaveLength(HISTORY_POINTS);
    expect(history.getState().time.at(-1)).toBe((HISTORY_POINTS + 49) / 10);
  });
});
