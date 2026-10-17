import { registry } from "../components/index.ts";
import { designStore } from "../store/index.ts";
import { createSimulationClient } from "./client.ts";
import { createSimulationController } from "./controller.ts";
import { createSystemHistory, type SystemHistory, useSystemHistory } from "./history.ts";
import { createLiveView, type LiveState, useLiveView } from "./live.ts";
import { simulationStore } from "./store.ts";

/** The lab's simulation: one worker, driven by the design and the run controls. */
export const simulation = createSimulationController({
  client: createSimulationClient(),
  design: designStore,
  store: simulationStore,
});

/** What the canvas shows while running, formatted and updated 4 times a second. */
export const live = createLiveView({ simulation: simulationStore, design: designStore, registry });

export function useLive<T>(selector: (state: LiveState) => T): T {
  return useLiveView(live, selector);
}

/** The system's numbers over time, for charts. */
export const history = createSystemHistory(simulationStore);

export function useRunHistory<T>(selector: (state: SystemHistory) => T): T {
  return useSystemHistory(history, selector);
}
