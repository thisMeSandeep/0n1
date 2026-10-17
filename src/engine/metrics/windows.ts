import { LatencyHistogram } from "./histogram.ts";

/*
 * Sliding windows over simulated time. The window is split into slots; a
 * value lands in the slot for its time, and slots older than the window are
 * reused. Reads cover the last `slots` slots, the newest one partial.
 */

export type WindowOptions = { windowMs: number; slots: number };

export const DEFAULT_WINDOW: WindowOptions = { windowMs: 5000, slots: 10 };

class SlotRing<T> {
  readonly slotMs: number;
  #ids: number[];
  #values: T[];

  constructor(
    readonly options: WindowOptions,
    create: () => T,
    private readonly clear: (value: T) => void,
  ) {
    this.slotMs = options.windowMs / options.slots;
    this.#ids = new Array(options.slots).fill(-1);
    this.#values = Array.from({ length: options.slots }, create);
  }

  slotId(time: number): number {
    return Math.floor(time / this.slotMs);
  }

  /** The slot for `time`, cleared first if it held an older slot's data. */
  at(time: number): T {
    const id = this.slotId(time);
    const index = id % this.options.slots;
    if (this.#ids[index] !== id) {
      this.#ids[index] = id;
      this.clear(this.#values[index] as T);
    }
    return this.#values[index] as T;
  }

  /** Slots that fall inside the window ending at `now`. */
  *live(now: number): Generator<T> {
    const newest = this.slotId(now);
    const oldest = newest - this.options.slots + 1;
    for (let i = 0; i < this.options.slots; i++) {
      const id = this.#ids[i] as number;
      if (id >= oldest && id <= newest) yield this.#values[i] as T;
    }
  }

  /** How much time the window currently covers (shorter at the very start of a run). */
  coveredMs(now: number): number {
    const newest = this.slotId(now);
    const partial = now - newest * this.slotMs;
    return Math.min(now, (this.options.slots - 1) * this.slotMs + partial);
  }
}

/** Events per second over the window. */
export class RateCounter {
  #ring: SlotRing<{ value: number }>;
  #total = 0;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#ring = new SlotRing(
      options,
      () => ({ value: 0 }),
      (slot) => {
        slot.value = 0;
      },
    );
  }

  /** Everything ever added. */
  get total(): number {
    return this.#total;
  }

  add(time: number, amount = 1): void {
    this.#ring.at(time).value += amount;
    this.#total += amount;
  }

  /** Amount added within the window ending at `now`. */
  sum(now: number): number {
    let sum = 0;
    for (const slot of this.#ring.live(now)) sum += slot.value;
    return sum;
  }

  /** Per second, over the window ending at `now`. */
  rate(now: number): number {
    const covered = this.#ring.coveredMs(now);
    return covered > 0 ? (this.sum(now) / covered) * 1000 : 0;
  }
}

/**
 * The time-weighted average of a value that changes in steps, e.g. how many
 * workers are busy. Utilization is this average divided by capacity.
 */
export class TimeWeightedGauge {
  #ring: SlotRing<{ area: number }>;
  #value = 0;
  #since = 0;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#ring = new SlotRing(
      options,
      () => ({ area: 0 }),
      (slot) => {
        slot.area = 0;
      },
    );
  }

  get value(): number {
    return this.#value;
  }

  /** Account for the current value from the last change until `time`, across slots. */
  #accumulate(time: number): void {
    // Anything older than the window doesn't matter; skip long idle gaps.
    let from = Math.max(this.#since, time - this.#ring.options.windowMs);
    while (from < time) {
      const slotEnd = (this.#ring.slotId(from) + 1) * this.#ring.slotMs;
      const to = Math.min(time, slotEnd);
      this.#ring.at(from).area += this.#value * (to - from);
      from = to;
    }
    this.#since = Math.max(this.#since, time);
  }

  set(time: number, value: number): void {
    this.#accumulate(time);
    this.#value = value;
  }

  average(now: number): number {
    this.#accumulate(now);
    const covered = this.#ring.coveredMs(now);
    if (covered <= 0) return this.#value;
    let area = 0;
    for (const slot of this.#ring.live(now)) area += slot.area;
    return area / covered;
  }
}

/** Latency percentiles over the window. */
export class WindowedHistogram {
  #ring: SlotRing<LatencyHistogram>;

  constructor(options: WindowOptions = DEFAULT_WINDOW) {
    this.#ring = new SlotRing(
      options,
      () => new LatencyHistogram(),
      (h) => h.reset(),
    );
  }

  record(time: number, valueMs: number, weight = 1): void {
    this.#ring.at(time).record(valueMs, weight);
  }

  /** One histogram of everything inside the window ending at `now`. */
  merged(now: number): LatencyHistogram {
    const merged = new LatencyHistogram();
    for (const slot of this.#ring.live(now)) merged.merge(slot);
    return merged;
  }
}
