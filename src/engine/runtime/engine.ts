import { BEHAVIOURS } from "../../components/behaviours.ts";
import { type Params, paramsSchema } from "../../model/component.ts";
import type { RuntimeModel } from "../compile.ts";
import type { ScheduledEvent } from "../core/eventQueue.ts";
import { createRng, type Rng } from "../core/prng.ts";
import { Simulator } from "../core/simulator.ts";
import {
  EdgeRecorder,
  edgeKey,
  type MetricsSnapshot,
  NodeRecorder,
  SystemRecorder,
} from "../metrics/recorder.ts";
import { DEFAULT_WINDOW, type WindowOptions } from "../metrics/windows.ts";
import { DEFAULT_NETWORK_LATENCY_MS } from "../network.ts";
import { SamplingController } from "./sampling.ts";
import { Trace, type TraceReason, type TraceRecord } from "./trace.ts";
import type {
  Behaviour,
  BehaviourContext,
  Clock,
  Outcome,
  Reply,
  Request,
  RequestKind,
} from "./types.ts";

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

/** Request tracing (S42): each client has a request traced this often, in the background… */
const AUTO_TRACE_EVERY_MS = 200;
/** …and every this often the engine keeps the slowest of those, and a failed one. */
export const TRACE_WINDOW_MS = 5000;
/** How long after the client's answer a trace waits for the rest of its calls (simulated ms). */
export const TRACE_SETTLE_MS = 10_000;

export { DEFAULT_NETWORK_LATENCY_MS } from "../network.ts";

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
  /** By edgeKey, created when a connection first carries a request. */
  readonly edgeRecorders = new Map<string, EdgeRecorder>();
  #window: WindowOptions;
  readonly sampling: SamplingController;
  #current = new Map<string, Incarnation>();
  #lives = new Map<string, number>();
  #downSince = new Map<string, number>();
  #rng: Rng;
  #latency: number;
  #requestId = 0;
  #traffic = 1;
  /**
   * Finished traces (S42) go here: ones asked for, and the slowest and a
   * failed one from the background every TRACE_WINDOW_MS. Background
   * tracing only runs while someone is listening.
   */
  onTrace: ((trace: TraceRecord) => void) | null = null;
  #asked: (string | null)[] = [];
  #autoNext = new Map<string, number>();
  #slowest: TraceRecord | null = null;
  #failed: TraceRecord | null = null;
  #traceIds = 0;
  /** Chaos timeline state (S40). */
  #slow = new Map<string, number>();
  #cut = new Set<string>();
  #surge = 1;

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
    this.#window = window;
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
    this.#scheduleEvents();

    const pickTraces = () => {
      this.#emitPicks();
      this.sim.schedule(TRACE_WINDOW_MS, pickTraces);
    };
    this.sim.schedule(TRACE_WINDOW_MS, pickTraces);

    const reconsider = () => {
      // A traffic shape moves the rate, so the sampling weight follows it.
      this.sampling.setOfferedRate(this.#offeredRate());
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
      // A slowed component (S40) takes longer over everything it does.
      schedule: (delay, event) =>
        sim.schedule(delay * (this.#slow.get(id) ?? 1), () => life.alive && event()),
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
      traffic: () => this.#traffic * this.#surge,
      tracing: { begin: (kind, at) => this.#beginTrace(id, kind, at) },
      sampling: {
        weight: () => this.sampling.weight,
        countRequest: () => this.sampling.countRequest(),
      },
    };
    life.behaviour = factory(ctx);
    return life;
  }

  #edge(from: string, to: string): EdgeRecorder {
    const key = edgeKey(from, to);
    let recorder = this.edgeRecorders.get(key);
    if (!recorder) {
      recorder = new EdgeRecorder(this.#window);
      this.edgeRecorders.set(key, recorder);
    }
    return recorder;
  }

  #send(from: Incarnation, to: string, request: Request, onReply: Reply): void {
    if (!from.alive) return;
    const key = edgeKey(from.id, to);
    const edge = this.#edge(from.id, to);
    const sentAt = this.sim.now;
    edge.send(sentAt, request.weight);
    // A traced request records this hop as a span (S42).
    // Recording goes on after the client's answer (a worker's job), until the trace is reported.
    const trace = request.trace && !request.trace.settled ? request.trace : undefined;
    const span =
      trace?.send(
        request.span ?? trace.root,
        to,
        sentAt,
        request.attempt,
        request.op ?? request.kind,
      ) ?? -1;
    const failed = (outcome: Outcome) => (outcome.ok ? "ok" : outcome.reason);
    // A reply only reaches the sender if it's still the same, living component.
    const deliver: Reply = (outcome) => {
      edge.reply(this.sim.now, this.sim.now - sentAt, outcome.ok, request.weight);
      if (trace) {
        // Failed before reaching it (cut, or down): it answered as it was refused.
        trace.reply(span, this.sim.now - this.#latency, failed(outcome));
        trace.receive(span, this.sim.now);
      }
      if (from.alive) onReply(outcome);
    };
    const back = (outcome: Outcome) => this.sim.schedule(this.#latency, () => deliver(outcome));

    this.sim.schedule(this.#latency, () => {
      if (this.#cut.has(key)) {
        // A cut connection: it fails at once, and it's no component's fault.
        back({ ok: false, reason: "unavailable", at: key });
        return;
      }
      const target = this.#current.get(to);
      if (!target?.alive) {
        back(UNAVAILABLE); // like a refused connection: fails fast
        return;
      }
      const pending: Pending = { settled: false, reply: back };
      target.pending.add(pending);
      request.path.push(to);
      trace?.arrive(span, this.sim.now);
      // A traced copy knows its span, so the calls it makes become its children.
      const delivered = trace ? { ...request, span } : request;
      target.behaviour.handle(delivered, (outcome) => {
        if (pending.settled) return;
        pending.settled = true;
        target.pending.delete(pending);
        trace?.reply(span, this.sim.now, failed(outcome));
        if (!outcome.ok && outcome.at === undefined) {
          // It failed here, not behind this component.
          this.recorders.get(to)?.originate(this.sim.now, request.weight);
          back({ ...outcome, at: to });
        } else {
          back(outcome);
        }
      });
    });
  }

  /** Real requests per second all clients offer right now, with the traffic multiplier. */
  #offeredRate(): number {
    const base = this.model.clients.reduce((sum, id) => {
      const life = this.#current.get(id);
      const rate = life?.behaviour.offeredRate?.() ?? this.model.nodes.get(id)?.params.rate;
      return sum + Number(rate ?? 0);
    }, 0);
    return base * this.#traffic * this.#surge;
  }

  /** Trace the next request from `client` (or from any client). */
  traceNext(client: string | null = null): void {
    this.#asked.push(client);
  }

  #beginTrace(client: string, kind: RequestKind, at: number): Trace | undefined {
    const asked = this.#asked.findIndex((c) => c === null || c === client);
    let reason: TraceReason | null = null;
    if (asked >= 0) {
      this.#asked.splice(asked, 1);
      reason = "asked";
    } else if (this.onTrace && at >= (this.#autoNext.get(client) ?? 0)) {
      this.#autoNext.set(client, at + AUTO_TRACE_EVERY_MS);
      reason = "slow"; // a candidate; it only shows if it's the slowest or fails
    }
    if (!reason) return undefined;
    return new Trace(`trace-${++this.#traceIds}`, reason, client, kind, at, {
      onFinish: (trace) => this.sim.schedule(TRACE_SETTLE_MS, () => trace.settle()),
      onSettle: (trace) => this.#traced(trace),
    });
  }

  #traced(trace: Trace): void {
    const record = trace.record();
    if (record.reason === "asked") {
      this.onTrace?.(record);
      return;
    }
    const took = (r: TraceRecord) => r.finishedAt - r.startedAt;
    if (record.outcome !== "ok") {
      this.#failed ??= { ...record, reason: "failed" };
    } else if (!this.#slowest || took(record) > took(this.#slowest)) {
      this.#slowest = record;
    }
  }

  #emitPicks(): void {
    if (this.#slowest) this.onTrace?.(this.#slowest);
    if (this.#failed) this.onTrace?.(this.#failed);
    this.#slowest = null;
    this.#failed = null;
  }

  /** Put the chaos timeline (S40) on the clock. A reset builds a new engine, so it replays the same. */
  #scheduleEvents(): void {
    const at = (time: number | null, run: () => void) => {
      if (time !== null) this.sim.at(Math.max(this.sim.now, time), run);
    };
    for (const event of this.model.events) {
      switch (event.kind) {
        case "down":
          at(event.at, () => this.takeDown(event.node));
          at(event.until, () => this.bringBack(event.node));
          break;
        case "slow":
          at(event.at, () => this.#slow.set(event.node, event.factor));
          at(event.until, () => this.#slow.delete(event.node));
          break;
        case "cut": {
          const key = edgeKey(event.from, event.to);
          at(event.at, () => this.#cut.add(key));
          at(event.until, () => this.#cut.delete(key));
          break;
        }
        case "flush":
          at(event.at, () => this.#current.get(event.node)?.behaviour.flush?.());
          break;
        case "surge":
          at(event.at, () => this.#setSurge(event.factor));
          at(event.until, () => this.#setSurge(1));
          break;
      }
    }
  }

  #setSurge(factor: number): void {
    this.#surge = factor;
    this.sampling.setOfferedRate(this.#offeredRate());
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
    this.#downSince.set(id, this.sim.now);
    this.#announce(id, false);
    return true;
  }

  /** Bring a component back, starting fresh. Returns false if it wasn't down. */
  bringBack(id: string): boolean {
    if (this.isUp(id) || !this.#current.has(id)) return false;
    const life = this.#incarnate(id);
    this.#current.set(id, life);
    this.#downSince.delete(id);
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
      nodes[id] = {
        ...recorder.snapshot(now),
        down: !this.isUp(id),
        downSince: this.#downSince.get(id) ?? null,
      };
    }
    const edges: MetricsSnapshot["edges"] = {};
    for (const [key, recorder] of this.edgeRecorders) edges[key] = recorder.snapshot(now);
    return {
      time: now,
      sampling: { weight: this.sampling.weight },
      system: this.system.snapshot(now),
      nodes,
      edges,
      faults: {
        slowed: Object.fromEntries(this.#slow),
        cut: [...this.#cut],
        surge: this.#surge,
      },
    };
  }
}
