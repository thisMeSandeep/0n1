/// <reference lib="webworker" />
import { SimulationHost } from "./host.ts";
import type { SimulationCommand, SimulationEvent } from "./protocol.ts";

/*
 * The simulation's Web Worker: everything heavy runs here, off the main
 * thread, so the canvas stays smooth.
 */

declare const self: DedicatedWorkerGlobalScope;

const host = new SimulationHost((event: SimulationEvent) => self.postMessage(event), {
  now: () => performance.now(),
  every: (ms, tick) => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
});

self.onmessage = (message: MessageEvent<SimulationCommand>) => host.handle(message.data);
