import type { NodeRecorder } from "../metrics/recorder.ts";
import type { Clock, Outcome, Reply, Request } from "./types.ts";

export type ServerOptions = {
  /** Requests handled at the same time; the rest wait in line. */
  concurrency: number;
  /** When this many are waiting, new requests are turned away. */
  maxWaiting: number;
  /**
   * The work for one request. Call `done` when it's finished. The request
   * holds its slots until then, including any time spent waiting on other
   * components, like a thread per request. Multiply the request's own work
   * time by `stretch` (see slotsFor).
   */
  work(request: Request, done: (outcome: Outcome) => void, stretch: number): void;
};

type Waiting = { request: Request; reply: Reply; arrivedAt: number };

/**
 * How a sampled request (weight w, standing for w real ones, S26) uses a
 * server: like w requests served side by side, it takes up to w slots, but
 * no more than are free; with fewer slots it runs proportionally longer
 * (`stretch`). Either way it uses w × its work time of slot time, so
 * utilization and throughput stay right, and no slot sits idle while work
 * waits (which would quietly shrink capacity).
 */
export function slotsFor(weight: number, free: number): { slots: number; stretch: number } {
  const slots = Math.max(1, Math.min(Math.round(weight), free));
  return { slots, stretch: Math.max(1, weight / slots) };
}

/**
 * The building block for anything that does work: a fixed number of slots
 * and a first-come, first-served line with a maximum length.
 */
export class QueueingServer {
  #busy = 0;
  #line: Waiting[] = [];
  #head = 0;
  /** Real requests waiting (sum of weights). */
  #waitingWeight = 0;

  constructor(
    private readonly sim: Clock,
    private readonly recorder: NodeRecorder,
    private readonly options: ServerOptions,
  ) {}

  /** Slots in use. */
  get busy(): number {
    return this.#busy;
  }

  /** Real requests waiting in line (weighted). */
  get waiting(): number {
    return this.#waitingWeight;
  }

  handle(request: Request, reply: Reply): void {
    const now = this.sim.now;
    this.recorder.arrive(now, request.weight);
    const entry = { request, reply, arrivedAt: now };
    const lineEmpty = this.#head === this.#line.length;
    if (lineEmpty && this.#busy < this.options.concurrency) {
      this.#start(entry);
    } else if (this.#waitingWeight + request.weight <= this.options.maxWaiting) {
      this.#line.push(entry);
      this.#waitingWeight += request.weight;
      this.recorder.setWaiting(this.#waitingWeight);
    } else {
      this.recorder.drop(now, request.weight);
      reply({ ok: false, reason: "rejected" });
    }
  }

  #start(entry: Waiting): void {
    const { slots, stretch } = slotsFor(
      entry.request.weight,
      this.options.concurrency - this.#busy,
    );
    this.#busy += slots;
    this.recorder.setBusy(this.sim.now, this.#busy, this.options.concurrency);
    let finished = false;
    this.options.work(
      entry.request,
      (outcome) => {
        if (finished) return;
        finished = true;
        const now = this.sim.now;
        this.recorder.complete(now, now - entry.arrivedAt, outcome.ok, entry.request.weight);
        this.#busy -= slots;
        this.recorder.setBusy(now, this.#busy, this.options.concurrency);
        entry.reply(outcome);
        this.#next();
      },
      stretch,
    );
  }

  #next(): void {
    // First come, first served: the head of the line goes as soon as a slot is free.
    for (;;) {
      const entry = this.#line[this.#head];
      if (!entry || this.#busy >= this.options.concurrency) return;
      this.#line[this.#head] = undefined as unknown as Waiting;
      this.#head++;
      this.#waitingWeight -= entry.request.weight;
      // Compact now and then so a long-lived line doesn't grow without bound.
      if (this.#head > 1024 && this.#head * 2 > this.#line.length) {
        this.#line = this.#line.slice(this.#head);
        this.#head = 0;
      }
      this.recorder.setWaiting(this.#waitingWeight);
      this.#start(entry);
    }
  }
}
