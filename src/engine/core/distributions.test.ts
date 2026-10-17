import { describe, expect, it } from "vitest";
import {
  createZipf,
  exponential,
  lognormal,
  standardNormal,
  uniform,
  uniformInt,
} from "./distributions.ts";
import { createRng } from "./prng.ts";

const N = 200_000;

function stats(sample: () => number) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < N; i++) {
    const x = sample();
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / N;
  return { mean, variance: sumSq / N - mean * mean };
}

const close = (actual: number, expected: number, relative: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);

describe("distributions", () => {
  it("uniform has the right mean and variance", () => {
    const rng = createRng(1);
    const { mean, variance } = stats(() => uniform(rng, 10, 30));
    close(mean, 20, 0.01);
    close(variance, 400 / 12, 0.02);
  });

  it("uniformInt stays in range and covers it", () => {
    const rng = createRng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const k = uniformInt(rng, 7);
      expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
      seen.add(k);
    }
    expect(seen.size).toBe(7);
  });

  it("exponential has mean m and variance m²", () => {
    const rng = createRng(3);
    const { mean, variance } = stats(() => exponential(rng, 25));
    close(mean, 25, 0.01);
    close(variance, 625, 0.03);
  });

  it("standard normal has mean 0 and variance 1", () => {
    const rng = createRng(4);
    const { mean, variance } = stats(() => standardNormal(rng));
    expect(Math.abs(mean)).toBeLessThan(0.01);
    close(variance, 1, 0.02);
  });

  it("lognormal matches the requested mean and coefficient of variation", () => {
    const rng = createRng(5);
    const { mean, variance } = stats(() => lognormal(rng, 20, 0.5));
    close(mean, 20, 0.01);
    close(Math.sqrt(variance) / mean, 0.5, 0.03);
  });

  it("lognormal with no variation is the mean", () => {
    expect(lognormal(createRng(6), 12, 0)).toBe(12);
  });
});

describe("createZipf", () => {
  /** Exact Zipf probabilities for ranks 0..n-1. */
  const pmf = (n: number, s: number) => {
    const weights = Array.from({ length: n }, (_, k) => 1 / (k + 1) ** s);
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / total);
  };

  it.each([
    [100, 1],
    [1000, 1.2],
    [50, 0.7],
  ])("matches the exact distribution (n=%i, s=%f)", (n, s) => {
    const zipf = createZipf(n, s);
    const rng = createRng(11);
    const counts = new Array(n).fill(0);
    for (let i = 0; i < N; i++) {
      const k = zipf.sample(rng);
      expect(k >= 0 && k < n).toBe(true);
      counts[k]++;
    }
    const expected = pmf(n, s);
    // The most popular ranks carry most of the mass: check them closely.
    for (let k = 0; k < 5; k++) close(counts[k] / N, expected[k] as number, 0.03);
  });

  it("is fast and in range for ten million keys", () => {
    const zipf = createZipf(10_000_000, 1);
    const rng = createRng(12);
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) {
      const k = zipf.sample(rng);
      expect(k >= 0 && k < 10_000_000).toBe(true);
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("rejects nonsense", () => {
    expect(() => createZipf(0)).toThrow(RangeError);
    expect(() => createZipf(10, 0)).toThrow(RangeError);
  });
});
