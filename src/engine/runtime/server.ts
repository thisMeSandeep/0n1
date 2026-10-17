import type { Simulator } from "../core/simulator.ts";
import type { NodeRecorder } from "../metrics/recorder.ts";
import type { Outcome, Reply, Request } from "./types.ts";

export type ServerOptions = {
  /** Requests handled at the same time; the rest wait in line. */
  concurrency: number;
  /** When this many are waiting, new requests are turned away. */
  maxWaiting: number;
  /**
   * The work for one request. Call `done` when it's finished. The request
   * holds its slot until then, including any time spent waiting on other
   * components (S23), like a thread per request.
   */
  work(request: Request, done: (outcome: Outcome) => void): void;
};

type Waiting = { request: Request; reply: Reply; arrivedAt: number };

/**
 * The building block for anything that does work: a fixed number of slots
 * and a first-come, first-served line with a maximum length.
 */
export class QueueingServer {
  #busy = 0;
  #line: Waiting[] = [];
  #head = 0;

  constructor(
    private readonly sim: Simulator,
    private readonly recorder: NodeRecorder,
    private readonly options: ServerOptions,
  ) {}

  get busy(): number {
    return this.#busy;
  }

  get waiting(): number {
    return this.#line.length - this.#head;
  }

  handle(request: Request, reply: Reply): void {
    const now = this.sim.now;
    this.recorder.arrive(now, request.weight);
    const entry = { request, reply, arrivedAt: now };
    if (this.#busy < this.options.concurrency) {
      this.#start(entry);
    } else if (this.waiting < this.options.maxWaiting) {
      this.#line.push(entry);
      this.recorder.setWaiting(this.waiting);
    } else {
      this.recorder.drop(now, request.weight);
      reply({ ok: false, reason: "rejected" });
    }
  }

  #start(entry: Waiting): void {
    this.#busy++;
    this.recorder.setBusy(this.sim.now, this.#busy, this.options.concurrency);
    let finished = false;
    this.options.work(entry.request, (outcome) => {
      if (finished) return;
      finished = true;
      const now = this.sim.now;
      this.recorder.complete(now, now - entry.arrivedAt, outcome.ok, entry.request.weight);
      this.#busy--;
      this.recorder.setBusy(now, this.#busy, this.options.concurrency);
      entry.reply(outcome);
      this.#next();
    });
  }

  #next(): void {
    if (this.#busy >= this.options.concurrency || this.waiting === 0) return;
    const entry = this.#line[this.#head] as Waiting;
    this.#line[this.#head] = undefined as unknown as Waiting;
    this.#head++;
    // Compact now and then so a long-lived line doesn't grow without bound.
    if (this.#head > 1024 && this.#head * 2 > this.#line.length) {
      this.#line = this.#line.slice(this.#head);
      this.#head = 0;
    }
    this.recorder.setWaiting(this.waiting);
    this.#start(entry);
  }
}
