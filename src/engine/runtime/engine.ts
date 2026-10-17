import { BEHAVIOURS } from "../../components/behaviours.ts";
import type { RuntimeModel } from "../compile.ts";
import { createRng } from "../core/prng.ts";
import { Simulator } from "../core/simulator.ts";
import { type MetricsSnapshot, NodeRecorder, SystemRecorder } from "../metrics/recorder.ts";
import { DEFAULT_WINDOW, type WindowOptions } from "../metrics/windows.ts";
import { SamplingController } from "./sampling.ts";
import type { Behaviour, Reply, Request } from "./types.ts";

export type EngineOptions = {
  seed?: number;
  /** One-way network delay per connection (ms). */
  networkLatencyMs?: number;
  /** The sliding window live metrics are computed over. */
  window?: WindowOptions;
  /**
   * Events per simulated second the engine aims to stay under; above it,
   * requests are sampled (S26). Infinity turns sampling off.
   */
  eventBudget?: number;
};

/**
 * Events per simulated second before sampling starts: roughly 30,000
 * requests a second in a typical system. The engine processes well over a
 * million events per second of real time, so at 1× speed this uses a small
 * share of a core. The worker scales it by the run speed (S28).
 */
export const DEFAULT_EVENT_BUDGET = 300_000;
/** How often (simulated ms) the sampling weight is reconsidered. */
const SAMPLING_INTERVAL_MS = 500;

/** Default one-way delay between components in the same data centre. */
export const DEFAULT_NETWORK_LATENCY_MS = 0.5;

/** A running simulation of one compiled system. */
export class Engine {
  readonly sim = new Simulator();
  readonly system: SystemRecorder;
  readonly recorders = new Map<string, NodeRecorder>();
  readonly sampling: SamplingController;
  #behaviours = new Map<string, Behaviour>();
  #requestId = 0;

  constructor(
    readonly model: RuntimeModel,
    {
      seed = 1,
      networkLatencyMs = DEFAULT_NETWORK_LATENCY_MS,
      window = DEFAULT_WINDOW,
      eventBudget = DEFAULT_EVENT_BUDGET,
    }: EngineOptions = {},
  ) {
    const rng = createRng(seed);
    this.system = new SystemRecorder(window);
    const offered = model.clients.reduce(
      (sum, id) => sum + Number(model.nodes.get(id)?.params.rate ?? 0),
      0,
    );
    this.sampling = new SamplingController(eventBudget, offered);
    const sampling = {
      weight: () => this.sampling.weight,
      countRequest: () => this.sampling.countRequest(),
    };

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
          sampling,
        }),
      );
    }
    for (const behaviour of this.#behaviours.values()) behaviour.start?.();
    const reconsider = () => {
      this.sampling.observe(this.sim.eventsProcessed);
      this.sim.schedule(SAMPLING_INTERVAL_MS, reconsider);
    };
    this.sim.schedule(SAMPLING_INTERVAL_MS, reconsider);
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
    return {
      time: now,
      sampling: { weight: this.sampling.weight },
      system: this.system.snapshot(now),
      nodes,
    };
  }
}
