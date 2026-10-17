import { EventQueue, type ScheduledEvent } from "./eventQueue.ts";

/**
 * The discrete-event loop. Simulated time is in milliseconds and only moves
 * when an event runs. Events are plain callbacks that may schedule more.
 * Running in one go or in many small `runUntil` chunks gives the same result,
 * so the worker can pace the simulation against the wall clock freely.
 */
export class Simulator {
  #queue = new EventQueue();
  #now = 0;
  #processed = 0;

  /** Current simulated time (ms). */
  get now(): number {
    return this.#now;
  }

  /** Events run so far. */
  get eventsProcessed(): number {
    return this.#processed;
  }

  get pendingEvents(): number {
    return this.#queue.size;
  }

  /** Run `event` `delay` ms from now. */
  schedule(delay: number, event: () => void): ScheduledEvent {
    if (!(delay >= 0)) throw new RangeError(`delay must be ≥ 0 (got ${delay})`);
    return this.#queue.push(this.#now + delay, event);
  }

  /** Run `event` at an absolute time, which can't be in the past. */
  at(time: number, event: () => void): ScheduledEvent {
    if (!(time >= this.#now)) throw new RangeError(`time ${time} is before now (${this.#now})`);
    return this.#queue.push(time, event);
  }

  cancel(event: ScheduledEvent): void {
    this.#queue.cancel(event);
  }

  /** Time of the next event, or null if nothing is scheduled. */
  nextEventTime(): number | null {
    return this.#queue.peek()?.time ?? null;
  }

  /** Run the next event. Returns false if there was nothing to run. */
  step(): boolean {
    const event = this.#queue.pop();
    if (!event) return false;
    this.#now = event.time;
    this.#processed++;
    event.run();
    return true;
  }

  /**
   * Run every event up to and including `time`, then move the clock to
   * `time`. Returns how many events ran.
   */
  runUntil(time: number): number {
    let ran = 0;
    for (;;) {
      const next = this.#queue.peek();
      if (!next || next.time > time) break;
      this.step();
      ran++;
    }
    if (time > this.#now) this.#now = time;
    return ran;
  }
}
