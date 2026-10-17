import type { Rng } from "./prng.ts";

/*
 * Random variates for the simulation. Times are in milliseconds.
 */

export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** An integer in [0, n). */
export function uniformInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/** Exponential with the given mean: the gap between arrivals of a Poisson process. */
export function exponential(rng: Rng, mean: number): number {
  return -mean * Math.log(1 - rng.next());
}

/** Standard normal (Box–Muller). */
export function standardNormal(rng: Rng): number {
  const u1 = 1 - rng.next(); // (0, 1], so the log is finite
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Lognormal with the given mean and coefficient of variation (stddev / mean).
 * Service times are like this: usually near the mean, with a long slow tail.
 */
export function lognormal(rng: Rng, mean: number, cv: number): number {
  if (cv <= 0) return mean;
  const sigma2 = Math.log(1 + cv * cv);
  const mu = Math.log(mean) - sigma2 / 2;
  return Math.exp(mu + Math.sqrt(sigma2) * standardNormal(rng));
}

/**
 * Zipf-distributed ranks in [0, n): rank 0 is the most popular, with
 * probability ∝ 1 / (rank + 1)^exponent. Uses rejection-inversion
 * (Hörmann & Derflinger), so sampling is O(1) even for 10 million keys.
 */
export function createZipf(n: number, exponent = 1) {
  if (!(n >= 1) || !Number.isInteger(n)) throw new RangeError("n must be a positive integer");
  if (!(exponent > 0)) throw new RangeError("exponent must be positive");

  const helper1 = (x: number) =>
    Math.abs(x) > 1e-8 ? Math.log1p(x) / x : 1 - x * (0.5 - x * (1 / 3 - 0.25 * x));
  const helper2 = (x: number) =>
    Math.abs(x) > 1e-8 ? Math.expm1(x) / x : 1 + x * 0.5 * (1 + (x / 3) * (1 + 0.25 * x));
  const h = (x: number) => Math.exp(-exponent * Math.log(x));
  const hIntegral = (x: number) => {
    const logX = Math.log(x);
    return helper2((1 - exponent) * logX) * logX;
  };
  const hIntegralInverse = (x: number) => {
    let t = x * (1 - exponent);
    if (t < -1) t = -1;
    return Math.exp(helper1(t) * x);
  };

  const hIntegralX1 = hIntegral(1.5) - 1;
  const hIntegralN = hIntegral(n + 0.5);
  const s = 2 - hIntegralInverse(hIntegral(2.5) - h(2));

  return {
    n,
    exponent,
    sample(rng: Rng): number {
      for (;;) {
        const u = hIntegralN + rng.next() * (hIntegralX1 - hIntegralN);
        const x = hIntegralInverse(u);
        const k = Math.min(n, Math.max(1, Math.round(x)));
        if (k - x <= s || u >= hIntegral(k + 0.5) - h(k)) return k - 1;
      }
    },
  };
}

export type Zipf = ReturnType<typeof createZipf>;
