import { registry } from "../components/index.ts";
import { designStore } from "../store/index.ts";
import { createSimulationClient } from "./client.ts";
import { createSimulationController } from "./controller.ts";
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
