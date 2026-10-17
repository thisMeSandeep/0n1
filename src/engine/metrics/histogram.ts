/**
 * A latency histogram with log-spaced buckets (the DDSketch scheme): any
 * quantile is within `RELATIVE_ACCURACY` of the true value, it's cheap to
 * update, and two histograms merge by adding counts. Counts are weights, so
 * sampled requests (S26) can count for more than one.
 */

/** Quantiles are within ±1% of the true value. */
export const RELATIVE_ACCURACY = 0.01;
const GAMMA = (1 + RELATIVE_ACCURACY) / (1 - RELATIVE_ACCURACY);
const LOG_GAMMA = Math.log(GAMMA);

/** Values below this (ms) are counted in a zero bucket: 1 µs. */
export const MIN_VALUE = 0.001;
/** Values above this (ms) are clamped: about 2.8 hours. */
export const MAX_VALUE = 1e7;

const MIN_INDEX = Math.ceil(Math.log(MIN_VALUE) / LOG_GAMMA);
const MAX_INDEX = Math.ceil(Math.log(MAX_VALUE) / LOG_GAMMA);
const BUCKETS = MAX_INDEX - MIN_INDEX + 1;

const indexOf = (value: number) =>
  Math.min(MAX_INDEX, Math.ceil(Math.log(value) / LOG_GAMMA)) - MIN_INDEX;
/** The value a bucket stands for: within RELATIVE_ACCURACY of anything in it. */
const bucketValue = (bucket: number) => (2 * GAMMA ** (bucket + MIN_INDEX)) / (GAMMA + 1);

export class LatencyHistogram {
  #counts = new Float64Array(BUCKETS);
  #zero = 0;
  #count = 0;
  #sum = 0;
  #min = Number.POSITIVE_INFINITY;
  #max = Number.NEGATIVE_INFINITY;

  /** Total weight recorded. */
  get count(): number {
    return this.#count;
  }

  get min(): number | null {
    return this.#count > 0 ? this.#min : null;
  }

  get max(): number | null {
    return this.#count > 0 ? this.#max : null;
  }

  get mean(): number | null {
    return this.#count > 0 ? this.#sum / this.#count : null;
  }

  record(valueMs: number, weight = 1): void {
    if (!(weight > 0) || !Number.isFinite(valueMs)) return;
    const value = Math.max(0, valueMs);
    if (value < MIN_VALUE) this.#zero += weight;
    else {
      const i = indexOf(value);
      this.#counts[i] = (this.#counts[i] ?? 0) + weight;
    }
    this.#count += weight;
    this.#sum += value * weight;
    if (value < this.#min) this.#min = value;
    if (value > this.#max) this.#max = value;
  }

  /** The value at quantile q (0..1), e.g. 0.99 for p99. Exact at 0 and 1. Null when empty. */
  quantile(q: number): number | null {
    if (this.#count === 0) return null;
    if (q <= 0) return this.#min;
    if (q >= 1) return this.#max;
    const rank = q * this.#count;
    let seen = this.#zero;
    if (rank <= seen && this.#zero > 0) return this.#min;
    for (let i = 0; i < BUCKETS; i++) {
      const count = this.#counts[i] ?? 0;
      seen += count;
      if (seen >= rank && count > 0)
        return Math.min(this.#max, Math.max(this.#min, bucketValue(i)));
    }
    return this.#max;
  }

  /** Add another histogram's samples into this one. */
  merge(other: LatencyHistogram): void {
    if (other.#count === 0) return;
    for (let i = 0; i < BUCKETS; i++)
      this.#counts[i] = (this.#counts[i] ?? 0) + (other.#counts[i] ?? 0);
    this.#zero += other.#zero;
    this.#count += other.#count;
    this.#sum += other.#sum;
    if (other.#min < this.#min) this.#min = other.#min;
    if (other.#max > this.#max) this.#max = other.#max;
  }

  reset(): void {
    this.#counts.fill(0);
    this.#zero = 0;
    this.#count = 0;
    this.#sum = 0;
    this.#min = Number.POSITIVE_INFINITY;
    this.#max = Number.NEGATIVE_INFINITY;
  }
}
