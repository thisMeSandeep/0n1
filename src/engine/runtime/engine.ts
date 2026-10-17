import { BEHAVIOURS } from "../../components/behaviours.ts";
import { type Params, paramsSchema } from "../../model/component.ts";
import type { RuntimeModel } from "../compile.ts";
import type { ScheduledEvent } from "../core/eventQueue.ts";
import { createRng, type Rng } from "../core/prng.ts";
import { Simulator } from "../core/simulator.ts";
import { type MetricsSnapshot, NodeRecorder, SystemRecorder } from "../metrics/recorder.ts";
import { DEFAULT_WINDOW, type WindowOptions } from "../metrics/windows.ts";
import { SamplingController } from "./sampling.ts";
import type { Behaviour, BehaviourContext, Clock, Outcome, Reply, Request } from "./types.ts";

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

const UNAVAILABLE: Outcome = { ok: false, reason: "unavailable" };

/** A request a component is working on, so it can be failed if the component goes down. */
type Pending = { settled: boolean; reply: Reply };

/**
 * One life of a component, from start (or being brought back) until it's
 * taken down. Everything it schedules, sends or replies is ignored once it's
 * dead, so a component that was taken down can't leak work, and coming back
 * starts from a clean slate (a restarted cache is cold).
 */
type Incarnation = {
  id: string;
  alive: boolean;
  behaviour: Behaviour;
  pending: Set<Pending>;
};

/** A running simulation of one compiled system. */
export class Engine {
  readonly sim = new Simulator();
  readonly system: SystemRecorder;
  readonly recorders = new Map<string, NodeRecorder>();
  readonly sampling: SamplingController;
  #current = new Map<string, Incarnation>();
  #lives = new Map<string, number>();
  #rng: Rng;
  #latency: number;
  #requestId = 0;
  #traffic = 1;

  constructor(
    readonly model: RuntimeModel,
    {
      seed = 1,
      networkLatencyMs = DEFAULT_NETWORK_LATENCY_MS,
      window = DEFAULT_WINDOW,
      eventBudget = DEFAULT_EVENT_BUDGET,
    }: EngineOptions = {},
  ) {
    this.#rng = createRng(seed);
    this.#latency = networkLatencyMs;
    this.system = new SystemRecorder(window);
    this.sampling = new SamplingController(eventBudget, this.#offeredRate());

    for (const id of model.order) {
      const node = model.nodes.get(id);
      if (!node) continue;
      if (!BEHAVIOURS[node.type]) {
        throw new Error(`${node.name}: ${node.definition.displayName} can't be simulated.`);
      }
      this.recorders.set(id, new NodeRecorder(window));
      this.#current.set(id, this.#incarnate(id));
    }
    for (const life of this.#current.values()) life.behaviour.start?.();

    const reconsider = () => {
      this.sampling.observe(this.sim.eventsProcessed);
      this.sim.schedule(SAMPLING_INTERVAL_MS, reconsider);
    };
    this.sim.schedule(SAMPLING_INTERVAL_MS, reconsider);
  }

  #incarnate(id: string): Incarnation {
    const node = this.model.nodes.get(id);
    const factory = node && BEHAVIOURS[node.type];
    if (!node || !factory) throw new Error(`Unknown component ${id}`);
    const lives = (this.#lives.get(id) ?? 0) + 1;
    this.#lives.set(id, lives);

    const life = { id, alive: true, pending: new Set<Pending>() } as Incarnation;
    const sim = this.sim;
    // Work this life schedules only happens while it's alive.
    const clock: Clock = {
      get now() {
        return sim.now;
      },
      schedule: (delay, event) => sim.schedule(delay, () => life.alive && event()),
      at: (time, event) => sim.at(time, () => life.alive && event()),
      cancel: (event: ScheduledEvent) => sim.cancel(event),
    };
    const ctx: BehaviourContext = {
      sim: clock,
      // The first life keeps the plain stream, so runs without failures don't change.
      rng: this.#rng.fork(lives === 1 ? id : `${id}#${lives}`),
      node,
      recorder: this.recorders.get(id) as NodeRecorder,
      system: this.system,
      nextRequestId: () => ++this.#requestId,
      send: (to, request, onReply) => this.#send(life, to, request, onReply),
      peer: (other) => this.model.nodes.get(other),
      isUp: (other) => this.isUp(other),
      traffic: () => this.#traffic,
      sampling: {
        weight: () => this.sampling.weight,
        countRequest: () => this.sampling.countRequest(),
      },
    };
    life.behaviour = factory(ctx);
    return life;
  }

  #send(from: Incarnation, to: string, request: Request, onReply: Reply): void {
    if (!from.alive) return;
    // A reply only reaches the sender if it's still the same, living component.
    const deliver: Reply = (outcome) => {
      if (from.alive) onReply(outcome);
    };
    const back = (outcome: Outcome) => this.sim.schedule(this.#latency, () => deliver(outcome));

    this.sim.schedule(this.#latency, () => {
      const target = this.#current.get(to);
      if (!target?.alive) {
        back(UNAVAILABLE); // like a refused connection: fails fast
        return;
      }
      const pending: Pending = { settled: false, reply: back };
      target.pending.add(pending);
      request.path.push(to);
      target.behaviour.handle(request, (outcome) => {
        if (pending.settled) return;
        pending.settled = true;
        target.pending.delete(pending);
        back(outcome);
      });
    });
  }

  /** Real requests per second all clients offer, with the traffic multiplier. */
  #offeredRate(): number {
    const base = this.model.clients.reduce(
      (sum, id) => sum + Number(this.model.nodes.get(id)?.params.rate ?? 0),
      0,
    );
    return base * this.#traffic;
  }

  /**
   * Change a component's settings while running. Validated against its
   * schema (throws if invalid); takes effect from the next request.
   */
  updateParams(id: string, patch: Params): void {
    const node = this.model.nodes.get(id);
    if (!node) throw new Error(`Unknown component ${id}`);
    const result = paramsSchema(node.definition).safeParse({ ...node.params, ...patch });
    if (!result.success) throw new Error(`Invalid settings for ${node.name}`);
    node.params = result.data as Params;
    if (node.type === "client") this.sampling.setOfferedRate(this.#offeredRate());
    for (const life of this.#current.values()) {
      if (life.alive && life.id !== id) life.behaviour.onPeerChange?.(id);
    }
  }

  /** Scale every client's rate (the Traffic % control). */
  setTrafficMultiplier(multiplier: number): void {
    if (!(multiplier > 0)) throw new RangeError("Traffic multiplier must be positive");
    this.#traffic = multiplier;
    this.sampling.setOfferedRate(this.#offeredRate());
  }

  get trafficMultiplier(): number {
    return this.#traffic;
  }

  /** Events per simulated second to stay under; the worker divides by the run speed. */
  setEventBudget(perSecond: number): void {
    this.sampling.setBudget(perSecond);
  }

  isUp(id: string): boolean {
    return this.#current.get(id)?.alive ?? false;
  }

  /**
   * Take a component down: everything it was working on fails as
   * unavailable, new requests to it fail fast, and its own work stops.
   * Returns false if it was already down.
   */
  takeDown(id: string): boolean {
    const life = this.#current.get(id);
    if (!life?.alive) return false;
    life.alive = false;
    for (const pending of life.pending) {
      pending.settled = true;
      pending.reply(UNAVAILABLE);
    }
    life.pending.clear();
    this.recorders.get(id)?.markDown(this.sim.now);
    this.#announce(id, false);
    return true;
  }

  /** Bring a component back, starting fresh. Returns false if it wasn't down. */
  bringBack(id: string): boolean {
    if (this.isUp(id) || !this.#current.has(id)) return false;
    const life = this.#incarnate(id);
    this.#current.set(id, life);
    life.behaviour.start?.();
    this.#announce(id, true);
    return true;
  }

  #announce(id: string, up: boolean): void {
    for (const life of this.#current.values()) {
      if (life.alive && life.id !== id) life.behaviour.onPeerStatus?.(id, up);
    }
  }

  /** Advance simulated time to `time` (ms). */
  runUntil(time: number): void {
    this.sim.runUntil(time);
  }

  snapshot(): MetricsSnapshot {
    const now = this.sim.now;
    const nodes: MetricsSnapshot["nodes"] = {};
    for (const [id, recorder] of this.recorders) {
      nodes[id] = { ...recorder.snapshot(now), down: !this.isUp(id) };
    }
    return {
      time: now,
      sampling: { weight: this.sampling.weight },
      system: this.system.snapshot(now),
      nodes,
    };
  }
}
