import { describe, expect, it } from "vitest";
import { NO_FAULTS } from "../engine/metrics/recorder.ts";
import type { SimulationCommand, SimulationEvent } from "../engine/worker/protocol.ts";
import { applyEvent, createSimulationClient, type WorkerLike } from "./client.ts";
import { createSimulationStore, initialSimulationState } from "./store.ts";

function fakeWorker() {
  const sent: SimulationCommand[] = [];
  let listener: ((event: MessageEvent<SimulationEvent>) => void) | null = null;
  let terminated = false;
  const worker: WorkerLike = {
    postMessage: (command) => sent.push(command),
    addEventListener: (_type, l) => {
      listener = l;
    },
    terminate: () => {
      terminated = true;
    },
  };
  const emit = (data: SimulationEvent) => listener?.({ data } as MessageEvent<SimulationEvent>);
  return { worker, sent, emit, terminated: () => terminated };
}

describe("simulation client", () => {
  it("starts the worker on first use and sends commands to it", () => {
    const fake = fakeWorker();
    let started = 0;
    const client = createSimulationClient(() => {
      started++;
      return fake.worker;
    }, createSimulationStore());
    expect(started).toBe(0);
    client.send({ type: "play" });
    client.send({ type: "pause" });
    expect(started).toBe(1);
    expect(fake.sent).toEqual([{ type: "play" }, { type: "pause" }]);
    client.stop();
    expect(fake.terminated()).toBe(true);
  });

  it("puts the worker's events into the store", () => {
    const fake = fakeWorker();
    const store = createSimulationStore();
    const client = createSimulationClient(() => fake.worker, store);
    client.send({ type: "play" });

    fake.emit({
      type: "loaded",
      ok: true,
      errors: [],
      warnings: [{ severity: "warning", message: "Idle" }],
    });
    expect(store.getState().warnings).toHaveLength(1);

    const snapshot = {
      time: 100,
      sampling: { weight: 1 },
      system: { goodput: 1, throughput: 1, errorRate: 0, latency: null },
      nodes: {},
      edges: {},
      faults: NO_FAULTS,
    };
    fake.emit({ type: "snapshot", snapshot, running: true, speed: 2, traffic: 1.5 });
    expect(store.getState()).toMatchObject({ snapshot, running: true, speed: 2, traffic: 1.5 });

    fake.emit({ type: "error", message: "Invalid settings for api" });
    expect(store.getState().lastError).toBe("Invalid settings for api");
  });

  it("clears the last snapshot when a system can't run", () => {
    const store = createSimulationStore();
    store.setState({ ...initialSimulationState, running: true, snapshot: { time: 5 } as never });
    applyEvent(store, {
      type: "loaded",
      ok: false,
      errors: [{ severity: "error", message: "Add a Client to send traffic." }],
      warnings: [],
    });
    expect(store.getState()).toMatchObject({ snapshot: null, running: false });
    expect(store.getState().errors[0]?.message).toMatch(/Add a Client/);
  });
});
