import { lognormal } from "../core/distributions.ts";
import type { Rng } from "../core/prng.ts";

/**
 * How much work varies from one request to the next: a lognormal with this
 * coefficient of variation (standard deviation ÷ mean). Most requests take
 * about the average; a few take much longer.
 */
export const WORK_TIME_CV = 1;

/** A random amount of work averaging `meanMs`. */
export function workTime(rng: Rng, meanMs: number): number {
  return lognormal(rng, meanMs, WORK_TIME_CV);
}
