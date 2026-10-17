import { BEHAVIOURS } from "../../components/behaviours.ts";
import type { RuntimeModel } from "../compile.ts";
import { createRng } from "../core/prng.ts";
import { Simulator } from "../core/simulator.ts";
import { type MetricsSnapshot, NodeRecorder, SystemRecorder } from "../metrics/recorder.ts";
import { DEFAULT_WINDOW, type WindowOptions } from "../metrics/windows.ts";
import type { Behaviour, Reply, Request } from "./types.ts";

export type EngineOptions = {
  seed?: number;
  /** One-way network delay per connection (ms). */
  networkLatencyMs?: number;
  /** The sliding window live metrics are computed over. */
  window?: WindowOptions;
};

/** Default one-way delay between components in the same data centre. */
export const DEFAULT_NETWORK_LATENCY_MS = 0.5;

/** A running simulation of one compiled system. */
export class Engine {
  readonly sim = new Simulator();
  readonly system: SystemRecorder;
  readonly recorders = new Map<string, NodeRecorder>();
  #behaviours = new Map<string, Behaviour>();
  #requestId = 0;

  constructor(
    readonly model: RuntimeModel,
    {
      seed = 1,
      networkLatencyMs = DEFAULT_NETWORK_LATENCY_MS,
      window = DEFAULT_WINDOW,
    }: EngineOptions = {},
  ) {
    const rng = createRng(seed);
    this.system = new SystemRecorder(window);

    for (const id of model.order) {
      const node = model.nodes.get(id);
      if (!node) continue;
      const factory = BEHAVIOURS[node.type];
      if (!factory)
        throw new Error(`${node.name}: ${node.definition.displayName} isn't simulated yet.`);
      const recorder = new NodeRecorder(window);
      this.recorders.set(id, recorder);
      this.#behaviours.set(
        id,
        factory({
          sim: this.sim,
          rng: rng.fork(id),
          node,
          recorder,
          system: this.system,
          nextRequestId: () => ++this.#requestId,
          send: (to, request, onReply) => this.#send(to, request, onReply, networkLatencyMs),
          peer: (other) => model.nodes.get(other),
        }),
      );
    }
    for (const behaviour of this.#behaviours.values()) behaviour.start?.();
  }

  #send(to: string, request: Request, onReply: Reply, latency: number): void {
    const target = this.#behaviours.get(to);
    if (!target) {
      onReply({ ok: false, reason: "unavailable" });
      return;
    }
    this.sim.schedule(latency, () => {
      request.path.push(to);
      target.handle(request, (outcome) => {
        this.sim.schedule(latency, () => onReply(outcome));
      });
    });
  }

  /** Advance simulated time to `time` (ms). */
  runUntil(time: number): void {
    this.sim.runUntil(time);
  }

  snapshot(): MetricsSnapshot {
    const now = this.sim.now;
    const nodes: MetricsSnapshot["nodes"] = {};
    for (const [id, recorder] of this.recorders) nodes[id] = recorder.snapshot(now);
    return { time: now, system: this.system.snapshot(now), nodes };
  }
}
