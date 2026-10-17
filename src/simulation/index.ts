import { designStore } from "../store/index.ts";
import { createSimulationClient } from "./client.ts";
import { createSimulationController } from "./controller.ts";
import { simulationStore } from "./store.ts";

/** The lab's simulation: one worker, driven by the design and the run controls. */
export const simulation = createSimulationController({
  client: createSimulationClient(),
  design: designStore,
  store: simulationStore,
});
