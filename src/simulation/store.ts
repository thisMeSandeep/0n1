import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { CompileIssue } from "../engine/compile.ts";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";

/**
 * Live simulation state on the main thread, fed by the worker. Kept apart
 * from the design store so metric updates never touch undo history.
 */
export type SimulationState = {
  /** Latest metrics, or null before anything has run. */
  snapshot: MetricsSnapshot | null;
  running: boolean;
  speed: number;
  traffic: number;
  /** Why the system can't run right now (compile errors), if it can't. */
  errors: CompileIssue[];
  warnings: CompileIssue[];
  /** A problem the worker reported while handling a command. */
  lastError: string | null;
};

export const initialSimulationState: SimulationState = {
  snapshot: null,
  running: false,
  speed: 1,
  traffic: 1,
  errors: [],
  warnings: [],
  lastError: null,
};

export function createSimulationStore() {
  return createStore<SimulationState>()(() => ({ ...initialSimulationState }));
}

export type SimulationStore = ReturnType<typeof createSimulationStore>;

export const simulationStore = createSimulationStore();

export function useSimulation<T>(selector: (state: SimulationState) => T): T {
  return useStore(simulationStore, selector);
}
