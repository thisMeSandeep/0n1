import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { SimulationStore } from "./store.ts";

/*
 * The system's numbers over time, for the charts in the system view. Unlike
 * the live view this keeps every snapshot (about 10 a second), so charts
 * stream smoothly. It starts over when time goes back (a reset or reload).
 */

/** Points kept: 2 minutes of snapshots at 1×. */
export const HISTORY_POINTS = 1200;

export type SystemHistory = {
  /** Simulated time, in seconds (uPlot's x axis). */
  time: number[];
  /** Responses per second. */
  throughput: number[];
  /** p99 as users see it (ms), or null before anything finished. */
  p99: (number | null)[];
  /** Share of responses that failed, as a percentage. */
  errors: number[];
};

const empty = (): SystemHistory => ({ time: [], throughput: [], p99: [], errors: [] });

export function createSystemHistory(simulation: SimulationStore) {
  const store = createStore<SystemHistory>(empty);

  simulation.subscribe((state, previous) => {
    const { snapshot } = state;
    if (snapshot === previous.snapshot) return;
    if (!snapshot) {
      store.setState(empty(), true);
      return;
    }
    const current = store.getState();
    const time = snapshot.time / 1000;
    const last = current.time.at(-1);
    const base = last !== undefined && time < last ? empty() : current;
    // Snapshots without time passing (pause, take down) don't add a point.
    if (last !== undefined && time === last && base === current) return;
    const add = <T>(values: T[], value: T) => [...values, value].slice(-HISTORY_POINTS);
    store.setState(
      {
        time: add(base.time, time),
        throughput: add(base.throughput, snapshot.system.throughput),
        p99: add(base.p99, snapshot.system.latency?.p99 ?? null),
        errors: add(base.errors, snapshot.system.errorRate * 100),
      },
      true,
    );
  });

  return store;
}

export type SystemHistoryStore = ReturnType<typeof createSystemHistory>;

export function useSystemHistory<T>(
  history: SystemHistoryStore,
  selector: (state: SystemHistory) => T,
): T {
  return useStore(history, selector);
}
