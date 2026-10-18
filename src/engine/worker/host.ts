import { registry } from "../../components/index.ts";
import type { SystemDocument } from "../../model/document.ts";
import { type CompileIssue, compile } from "../compile.ts";
import { DEFAULT_EVENT_BUDGET, Engine } from "../runtime/engine.ts";
import type { SimulationCommand, SimulationEvent } from "./protocol.ts";

/** Wall-clock time and a repeating timer: real in the worker, fake in tests. */
export type Timers = {
  now(): number;
  every(ms: number, tick: () => void): () => void;
};

/** How often the run advances (wall ms). */
const TICK_MS = 16;
/** How often snapshots go to the lab while running (wall ms). */
export const SNAPSHOT_MS = 100;
/** Most wall time one tick may simulate, so a throttled tab doesn't jump ahead. */
const MAX_TICK_MS = 250;

/**
 * Runs a simulation against the wall clock and answers commands. It has no
 * worker globals, so tests can drive it with fake timers; worker.ts wires it
 * to postMessage.
 */
export class SimulationHost {
  #doc: SystemDocument | null = null;
  #seed = 1;
  #engine: Engine | null = null;
  #running = false;
  #speed = 1;
  #traffic = 1;
  #stopTimer: (() => void) | null = null;
  #lastTick = 0;
  /** When the next running snapshot is due (wall ms). */
  #nextSnapshot = 0;

  constructor(
    private readonly emit: (event: SimulationEvent) => void,
    private readonly timers: Timers,
  ) {}

  handle(command: SimulationCommand): void {
    try {
      this.#handle(command);
    } catch (error) {
      this.emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  #handle(command: SimulationCommand): void {
    switch (command.type) {
      case "load":
        this.#doc = structuredClone(command.doc);
        this.#seed = command.seed ?? 1;
        this.#start();
        return;
      case "reset":
        this.#start();
        return;
      case "play":
        if (!this.#engine) return;
        this.#running = true;
        this.#ensureTimer();
        break;
      case "pause":
        this.#running = false;
        this.#stopTimerIfIdle();
        break;
      case "step":
        this.#running = false;
        this.#stopTimerIfIdle();
        this.#engine?.runUntil(this.#engine.sim.now + command.ms);
        break;
      case "setSpeed":
        if (!(command.speed > 0)) throw new RangeError("Speed must be positive");
        this.#speed = command.speed;
        this.#engine?.setEventBudget(DEFAULT_EVENT_BUDGET / this.#speed);
        break;
      case "setTraffic":
        this.#traffic = command.multiplier;
        this.#engine?.setTrafficMultiplier(command.multiplier);
        break;
      case "updateParams": {
        this.#engine?.updateParams(command.nodeId, command.params);
        // Keep the document in step, so a reset uses the new settings too.
        const node = this.#doc?.nodes.find((n) => n.id === command.nodeId);
        if (node) node.params = { ...node.params, ...command.params };
        break;
      }
      case "takeDown":
        this.#engine?.takeDown(command.nodeId);
        break;
      case "bringBack":
        this.#engine?.bringBack(command.nodeId);
        break;
      case "trace":
        this.#engine?.traceNext(command.clientId);
        return; // nothing to show until it finishes
    }
    this.#sendSnapshot();
  }

  /** Compile the document and start a fresh engine. */
  #start(): void {
    if (!this.#doc) return;
    const { model, errors, warnings } = compile(this.#doc, registry);
    this.#engine = null;
    if (!model) {
      this.#running = false;
      this.#stopTimerIfIdle();
      this.emit({ type: "loaded", ok: false, errors: plain(errors), warnings: plain(warnings) });
      return;
    }
    this.#engine = new Engine(model, {
      seed: this.#seed,
      eventBudget: DEFAULT_EVENT_BUDGET / this.#speed,
    });
    if (this.#traffic !== 1) this.#engine.setTrafficMultiplier(this.#traffic);
    this.#engine.onTrace = (trace) => this.emit({ type: "trace", trace });
    this.emit({ type: "loaded", ok: true, errors: [], warnings: plain(warnings) });
    if (this.#running) this.#ensureTimer();
    this.#sendSnapshot();
  }

  #ensureTimer(): void {
    if (this.#stopTimer) return;
    this.#lastTick = this.timers.now();
    this.#nextSnapshot = this.#lastTick + SNAPSHOT_MS;
    this.#stopTimer = this.timers.every(TICK_MS, () => this.#tick());
  }

  #stopTimerIfIdle(): void {
    if (this.#running || !this.#stopTimer) return;
    this.#stopTimer();
    this.#stopTimer = null;
  }

  #tick(): void {
    const now = this.timers.now();
    const elapsed = Math.min(MAX_TICK_MS, now - this.#lastTick);
    this.#lastTick = now;
    if (!this.#running || !this.#engine) return;
    this.#engine.runUntil(this.#engine.sim.now + elapsed * this.#speed);
    if (now >= this.#nextSnapshot) {
      // Fixed deadlines keep a steady 10 a second; if far behind, start afresh.
      this.#nextSnapshot += SNAPSHOT_MS;
      if (this.#nextSnapshot <= now) this.#nextSnapshot = now + SNAPSHOT_MS;
      this.#sendSnapshot();
    }
  }

  #sendSnapshot(): void {
    if (!this.#engine) return;
    this.emit({
      type: "snapshot",
      snapshot: this.#engine.snapshot(),
      running: this.#running,
      speed: this.#speed,
      traffic: this.#traffic,
    });
  }
}

/** Issues without anything that can't be posted between threads. */
function plain(issues: CompileIssue[]): CompileIssue[] {
  return issues.map(({ severity, message, nodeId, edgeId }) => ({
    severity,
    message,
    ...(nodeId ? { nodeId } : {}),
    ...(edgeId ? { edgeId } : {}),
  }));
}
