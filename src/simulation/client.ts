import type { SimulationCommand, SimulationEvent } from "../engine/worker/protocol.ts";
import { type SimulationStore, simulationStore } from "./store.ts";

/** The part of a Worker the client needs; a fake in tests. */
export type WorkerLike = {
  postMessage(command: SimulationCommand): void;
  addEventListener(type: "message", listener: (event: MessageEvent<SimulationEvent>) => void): void;
  terminate(): void;
};

/** Apply one event from the worker to the store. */
export function applyEvent(store: SimulationStore, event: SimulationEvent): void {
  switch (event.type) {
    case "loaded":
      store.setState({
        errors: event.errors,
        warnings: event.warnings,
        lastError: null,
        ...(event.ok ? {} : { snapshot: null, running: false }),
      });
      return;
    case "snapshot":
      store.setState({
        snapshot: event.snapshot,
        running: event.running,
        speed: event.speed,
        traffic: event.traffic,
      });
      return;
    case "error":
      store.setState({ lastError: event.message });
      return;
  }
}

/**
 * Talks to the simulation worker. Commands go out; events land in the
 * simulation store. The worker is started on first use.
 */
export function createSimulationClient(
  startWorker: () => WorkerLike = () =>
    new Worker(new URL("../engine/worker/worker.ts", import.meta.url), { type: "module" }),
  store: SimulationStore = simulationStore,
) {
  let worker: WorkerLike | null = null;
  const connect = () => {
    if (!worker) {
      worker = startWorker();
      worker.addEventListener("message", (event) => applyEvent(store, event.data));
    }
    return worker;
  };
  return {
    send(command: SimulationCommand): void {
      connect().postMessage(command);
    },
    stop(): void {
      worker?.terminate();
      worker = null;
    },
  };
}

export type SimulationClient = ReturnType<typeof createSimulationClient>;
